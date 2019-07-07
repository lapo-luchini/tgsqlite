#!/usr/bin/env node --optimize-for-size
'use strict';
const
    fs = require('fs'),
    Transform = require('stream').Transform,
    JSONStream = require('JSONStream'),
    sqlite = require('sqlite');

if (process.argv.length < 3) {
    console.log('specify path to result.json file (or "-" for stdin)');
    process.exit(1);
}

function getInput() {
    const filename = process.argv[2];
    if (filename == '-') {
        process.stdin.setEncoding('utf8');
        return process.stdin;
    } else
        return fs.createReadStream(filename, 'utf8');
}

function unixtime(str) {
    return Date.parse(str) / 1000;
}

function streamEnd(stream) {
    return new Promise((resolve, reject) => {
        stream.on('end', resolve);
        stream.on('error', reject);
    });
}

class AsyncTransform extends Transform {
    constructor(func) {
        super({
            objectMode: true,
            transform(chunk, encoding, callback) {
                func(chunk).then(
                    result => { callback(null, result); },
                    error => { callback(error); }
                );
            },
        });
    }
}

(async () => {
    if (fs.existsSync('telegram.sqlite'))
        fs.unlinkSync('telegram.sqlite');
    const db = await sqlite.open('telegram.sqlite', { Promise });
    await db.run('PRAGMA page_size = 32768'); // smallest database size
    for (const sql of fs.readFileSync('schema.sql', 'utf8').replace(/^--.*$/gm, '').trim().split(/;\s+/))
        await db.run(sql);
    await db.run('PRAGMA foreign_keys = ON');
    const userId = {};
    const setUser = await db.prepare('INSERT INTO user (id, name) VALUES (?,?)');
    const setMessage = await db.prepare('INSERT INTO message (id, chat, type, date, edited, author, reply, text) VALUES (?,?,?,?,?,?,?,?)');
    const setChat = await db.prepare('INSERT INTO chat (id, name, type, date, num) VALUES (?, ?,?,?,?)');
    const reSpace = /_(supergroup|channel)$/; // these messages use a separated numbering space
    let space = 0;
    async function myParse(chat) {
        if (chat.messages.length)
            chat.date = unixtime(chat.messages[0].date);
        await setChat.run(chat.id, chat.name, chat.type, chat.date, chat.messages.length);
        console.log('Chat:', {id: chat.id, name: chat.name, type: chat.type, len: chat.messages.length});
        let offset = 0;
        if (reSpace.test(chat.type)) {
            // I assume 1e10 messages per space will be enough
            // (this allows for 900718 spaces = Number.MAX_SAFE_INTEGER / 1e10)
            ++space;
            offset = space * 1e10;
        }
        await db.run('BEGIN');
        for (const m of chat.messages) {
            if (m.type == 'service') {
                // store service metadata in text field
                const m2 = Object.assign({}, m);
                delete m2.id;
                delete m2.type;
                delete m2.date;
                delete m2.edited;
                delete m2.actor;
                delete m2.actor_id;
                delete m2.text;
                m.from = m.actor;
                m.from_id = m.actor_id;
                m.text = m2;
            }
            const author = m.from_id;
            if (!(author in userId)) {
                await setUser.run(author, m.from);
                userId[author] = m.from;
            } else if (userId[author] != m.from)
                throw new Error('Different user name: ' + userId[author] + ' ≠ ' + m.from);
            await setMessage.run(m.id + offset, chat.id,
                (m.type == 'message') ? null : m.type,
                unixtime(m.date),
                m.edited.startsWith('1970') ? null : unixtime(m.edited),
                author,
                m.reply_to_message_id,
                JSON.stringify(m.text));
        }
        await db.run('COMMIT');
    }
    const stream = getInput(
    ).pipe(JSONStream.parse('chats.list.*')
    ).pipe(new AsyncTransform(myParse));
    await streamEnd(stream);
    console.log('Final vacuum.');
    await db.run('VACUUM'); 
})().catch(err => {
    console.log(err.stack);
});
