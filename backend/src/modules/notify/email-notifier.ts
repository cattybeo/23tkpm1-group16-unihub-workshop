import nodemailer from 'nodemailer'
import QRCode from 'qrcode'
import type { INotifier, NotificationPayload } from './types.js'

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
})

export class EmailNotifier implements INotifier {
  readonly channel = 'email'

  async send(payload: NotificationPayload): Promise<void> {
    const to = payload.userEmail
    if (!to) {
      console.warn('[email] skipped — no email address', { notification_id: payload.id })
      return
    }

    const qrBuffer = payload.qrToken
      ? await QRCode.toBuffer(payload.qrToken, { width: 300, margin: 2 })
      : null

    const bodyHtml = payload.body.replace(/\n/g, '<br>')

    const html = qrBuffer
      ? `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
  <div style="background:#007AFF;padding:32px 40px">
    <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.3px">UniHub Workshop</h1>
  </div>
  <div style="padding:40px">
    <p style="margin:0 0 24px;font-size:16px;color:#1C1C1E;line-height:1.6">${bodyHtml}</p>
    <div style="text-align:center;background:#F2F2F7;border-radius:16px;padding:32px">
      <p style="margin:0 0 16px;font-size:15px;font-weight:600;color:#1C1C1E">Mã QR check-in của bạn</p>
      <img src="cid:qrcode@unihub" width="200" height="200" alt="QR Code check-in"
           style="display:block;margin:0 auto;border-radius:8px;background:#fff;padding:8px"/>
      <p style="margin:16px 0 0;font-size:13px;color:#8E8E93">Xuất trình mã QR này khi check-in tại workshop.</p>
    </div>
  </div>
  <div style="padding:24px 40px;border-top:1px solid #F2F2F7;text-align:center">
    <p style="margin:0;font-size:13px;color:#8E8E93">UniHub Workshop — Trường Đại học Khoa học Tự nhiên TP.HCM</p>
  </div>
</div>`
      : `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
  <h2 style="color:#007AFF">UniHub Workshop</h2>
  <p style="font-size:16px;color:#1C1C1E;line-height:1.6">${bodyHtml}</p>
</div>`

    await transporter.sendMail({
      from: `"UniHub Workshop" <${process.env.SMTP_USER}>`,
      to,
      subject: payload.title,
      text: payload.body,
      html,
      ...(qrBuffer && {
        attachments: [{
          filename: 'qr-checkin.png',
          content: qrBuffer,
          cid: 'qrcode@unihub',
        }],
      }),
    })

    console.info('[email] sent', { to, notification_id: payload.id, has_qr: !!qrBuffer })
  }
}
