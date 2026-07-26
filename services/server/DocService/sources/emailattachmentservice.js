const config = require("config")
const co = require("co")
const mailService = require("./../../Common/sources/mailService")
const operationContext = require("./../../Common/sources/operationContext")

exports.sendEmailAttachment = (req, res) =>
  co(function* () {
    const ctx = new operationContext.Context()
    try {
      ctx.initFromRequest(req)
      yield ctx.initTenantCache()

      const { to, subject, body, fileName, mimeType, fileData } = req.body

      if (!to || !fileData || !fileName) {
        res.status(400).json({
          error: "Missing required fields: to, fileData, fileName",
        })
        return
      }

      // Validate email
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(to)) {
        res.status(400).json({ error: "Invalid email address" })
        return
      }

      // Get SMTP configuration from tenant context or defaults
      const mailServerConfig = ctx.getCfg(
        "email.smtpServerConfiguration",
        config.get("email.smtpServerConfiguration"),
      )
      const host = mailServerConfig.host
      const port = mailServerConfig.port
      const auth = mailServerConfig.auth
      const contactDefaults = ctx.getCfg(
        "email.contactDefaults",
        config.get("email.contactDefaults"),
      )

      // Create or reuse transporter
      mailService.createTransporter(ctx, host, port, auth, contactDefaults)

      const mailObject = {
        to,
        subject: subject || `Document: ${fileName}`,
        text: body || "Please find the attached document.",
        attachments: [
          {
            filename: fileName,
            content: fileData,
            encoding: "base64",
            contentType: mimeType || "application/octet-stream",
          },
        ],
      }

      yield mailService.send(host, auth.user, mailObject)

      ctx.logger.info("Email attachment sent to %s: %s", to, fileName)
      res.json({ status: "ok" })
    } catch (err) {
      ctx.logger.error("sendEmailAttachment error: %s", err.stack)
      res.status(500).json({ error: err.message })
    }
  })
