#!/usr/bin/env node --optimize-for-size
'use strict';
const
    fs = require('fs'),
    JSONStream = require('JSONStream'),
    sqlite = require('sqlite');

if (process.argv.length < 3) {
    console.log('specify path to result.json file (or "-" for stdin)');
    process.exit(1);
}
const filename = process.argv[2];

function unixtime(str) {
    return Date.parse(str) / 1000;
}

if (fs.existsSync('telegram.sqlite'))
    fs.unlinkSync('telegram.sqlite');
Promise.resolve(
).then(() => sqlite.open('telegram.sqlite', { Promise })
).then(async db => {
    await db.run('PRAGMA page_size = 32768'); // smallest database size
    for (const sql of fs.readFileSync('schema.sql', 'utf8').replace(/^--.*$/gm, '').trim().split(/;\s+/))
        await db.run(sql);
    await db.run('PRAGMA foreign_keys = ON');
    const userId = {};
    const setUser = await db.prepare('INSERT INTO user (name) VALUES (?)');
    const setMessage = await db.prepare('INSERT INTO message (id, chat, type, date, edited, author, reply, text) VALUES (?,?,?,?,?,?,?,?)');
    const setChat = await db.prepare('INSERT INTO chat (id, name, type, date, num) VALUES (?, ?,?,?,?)');
    const reSpace = /_(supergroup|channel)$/; // these messages use a separated numbering space
    let space = 0;
    const parser = JSONStream.parse('chats.list.*');
    parser.on('data', async chat => {
        parser.pause(); // using async, we're terminating right away so we must pause or the next 'data' event would arrive
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
            let author = m.from;
            if (author) {
                author = userId[m.from];
                if (!author) {
                    let st = await setUser.run(m.from);
                    userId[m.from] = author = st.lastID;
                }
            }
            await setMessage.run(m.id + offset, chat.id,
                (m.type == 'message') ? null : m.type,
                unixtime(m.date),
                m.edited.startsWith('1970') ? null : unixtime(m.edited),
                author,
                m.reply_to_message_id,
                JSON.stringify(m.text));
        }
        await db.run('COMMIT');
        parser.resume();
    });
    await new Promise((resolve, reject) => {
        parser.on('end', resolve);
        parser.on('error', reject);
        if (filename == '-') {
            process.stdin.setEncoding('utf8');
            process.stdin.pipe(parser);
        } else
            fs.createReadStream(filename, 'utf8').pipe(parser);
    });
    console.log('Final vacuum.');
    await db.run('VACUUM'); 
}).catch(err => {
    console.log(err.stack);
});
