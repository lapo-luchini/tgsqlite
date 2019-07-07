CREATE TABLE chat (
    id INTEGER PRIMARY KEY,
    name TEXT,
    type TEXT NOT NULL,
    date INTEGER, -- taken from first message
    num INTEGER NOT NULL -- total number of messages
);
CREATE TABLE user (
    id INTEGER PRIMARY KEY,
    name TEXT
);
CREATE TABLE message (
    id INTEGER PRIMARY KEY,
    chat INTEGER NOT NULL,
    type TEXT, -- NULL for the default "message" type
    date INTEGER NOT NULL,
    edited INTEGER, -- is NULL when dump contains year 1970
    author INTEGER, -- "from" field (can be null in the dump)
    reply INTEGER, -- "reply_to_message_id" field
    text TEXT NOT NULL, -- in JSON as it can contain formatting
    FOREIGN KEY (chat) REFERENCES chat (id),
    FOREIGN KEY (author) REFERENCES user (id)
);
-- can be useful, but it does occupy space and can always be created later
-- CREATE INDEX message_chat ON message (chat, id)
