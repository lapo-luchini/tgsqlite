CREATE TABLE chat (
    "id" INTEGER PRIMARY KEY,
    "name" TEXT,
    "type" TEXT,
    "date" INTEGER
);
CREATE TABLE user (
    "id" INTEGER PRIMARY KEY,
    "name" TEXT
);
CREATE INDEX user_name ON user ("name");
CREATE TABLE message (
    "id" INTEGER PRIMARY KEY,
    "chat" INTEGER,
    "type" TEXT, -- NULL is the default "message" type
    "date" INTEGER,
    "edited" INTEGER,
    "from" INTEGER,
    "reply" INTEGER, -- "reply_to_message_id" field
    "text" TEXT, -- in JSON as it can contain formatting
    FOREIGN KEY ("chat") REFERENCES chat ("id"),
    FOREIGN KEY ("from") REFERENCES user ("id")
);
CREATE INDEX message_chat ON message ("chat", "id");
