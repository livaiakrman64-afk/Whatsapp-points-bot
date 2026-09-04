const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const fs = require('fs');

// ملف تخزين النقاط
const POINTS_FILE = './points.json';
let points = {};
if (fs.existsSync(POINTS_FILE)) {
    points = JSON.parse(fs.readFileSync(POINTS_FILE));
}

function savePoints() {
    fs.writeFileSync(POINTS_FILE, JSON.stringify(points));
}

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: true
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            qrcode.generate(qr, { small: true });
        }
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode!== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                startBot();
            }
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const sender = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text;

        if (!text) return;

        // امر اضافة نقطة
        if (text.startsWith('!add @')) {
            const mentioned = msg.message.extendedTextMessage?.contextInfo?.mentionedJid;
            if (mentioned && mentioned[0]) {
                const user = mentioned[0];
                points[user] = (points[user] || 0) + 1;
                savePoints();
                await sock.sendMessage(sender, { text: `تم اضافة نقطة لـ @${user.split('@')[0]}. نقاطه الان: ${points[user]}` }, { mentions: [user] });
            }
        }

        // امر عرض النقاط
        if (text === '!points') {
            let reply = '*قائمة النقاط:*\n\n';
            for (let user in points) {
                reply += `@${user.split('@')[0]} : ${points[user]} نقطة\n`;
            }
            await sock.sendMessage(sender, { text: reply, mentions: Object.keys(points) });
        }

        // امر مسح النقاط
        if (text === '!reset') {
            points = {};
            savePoints();
            await sock.sendMessage(sender, { text: 'تم تصفير كل النقاط' });
        }
    });
}

startBot();
