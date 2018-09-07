#!/usr/bin/env node
'use strict';
const
    fs = require('fs'),
    sqlite = require('sqlite');

if (process.argv.length < 3) {
    console.log('specify path to result.json file');
    process.exit(1);
}

if (fs.existsSync('telegram.sqlite'))
    fs.unlinkSync('telegram.sqlite');
Promise.resolve(
).then(() => sqlite.open('telegram.sqlite', { Promise })
).then(async db => {
    for (const sql of fs.readFileSync('schema.sql', 'utf8').trim().split(/;\s+/))
        await db.run(sql);
    await db.run('PRAGMA foreign_keys = ON');
    const chats = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')).chats;
    chats.forEach(c => { // calculate age from first message
        c.date = Date.parse(c.messages.length ? c.messages[0].date : '9999-01-01T00:00:00');
    });
    chats.sort((a, b) => { // sort chats by age
        return a.date - b.date;
    });
    const getUser = await db.prepare('SELECT id FROM user WHERE name = ?');
    const setUser = await db.prepare('INSERT INTO user (name) VALUES (?)');
    const setMessage = await db.prepare('INSERT INTO message (id, chat, type, date, edited, "from", reply, "text") VALUES (?,?,?,?,?,?,?,?)');
    const setChat = await db.prepare('INSERT INTO chat (name, type) VALUES (?,?)');
    const reSpace = /_(supergroup|channel)$/; // these messages use a separated numbering
    let space = 0;
    for (const chat of chats) {
        chat.id = (await setChat.run(chat.name, chat.type)).lastID;
        console.log('Chat:', {id: chat.id, name: chat.name, type: chat.type, len: chat.messages.length});
        let offset = 0;
        if (reSpace.test(chat.type)) {
            ++space;
            offset = space * 10000000000; // I assume 1E10 messages per space will be enough (this allows for 900718 spaces = Number.MAX_SAFE_INTEGER / 1E10)
        }
        await db.run('BEGIN');
        for (const m of chat.messages) {
            let from = m.from;
            if (from) {
                from = await getUser.get(m.from);
                if (from)
                    from = from.id;
                else {
                    let st = await setUser.run(m.from);
                    from = st.lastID;
                }
            }
            await setMessage.run(m.id + offset, chat.id,
                (m.type == 'message') ? null : m.type,
                Date.parse(m.date),
                Date.parse(m.edited),
                from,
                m.reply_to_message_id,
                JSON.stringify(m.text));
        }
        await db.run('COMMIT');
    }
}).catch(err => {
    console.log(err.stack);
});
