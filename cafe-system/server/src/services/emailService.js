import { config } from '../config/index.js';
import { NotificationLog } from '../models/NotificationLog.js';

export const emailService = {
  /**
   * Sends an email via Resend API with automatic retry and audit logging.
   * Never throws uncaught errors that could disrupt business operations.
   */
  async sendEmail({
    to,
    subject,
    html,
    text = '',
    notificationType = 'system_alert',
    metadata = {},
    maxRetries = 2,
  }) {
    if (!to) {
      console.warn('[EmailService] Skipped sending: No recipient specified.');
      return { success: false, error: 'No recipient' };
    }

    const recipients = Array.isArray(to) ? to : [to];
    const results = [];

    for (const recipient of recipients) {
      // 1. Create pending notification log
      let log;
      try {
        log = await NotificationLog.create({
          recipient,
          notificationType,
          subject,
          status: 'pending',
          attemptCount: 1,
          metadata,
        });
      } catch (err) {
        console.error('[EmailService] Failed to create notification log:', err.message);
      }

      // 2. Determine if Resend API key is provided
      const apiKey = config.resendApiKey;
      const isSimulated =
        !apiKey ||
        apiKey.startsWith('re_1234') ||
        config.nodeEnv === 'test' ||
        process.env.NODE_ENV === 'test' ||
        process.env.npm_lifecycle_event === 'test';

      let sentSuccess = false;
      let lastError = null;
      let resendId = null;
      let attempts = 0;

      while (attempts <= maxRetries && !sentSuccess) {
        attempts++;
        try {
          if (isSimulated) {
            // Simulated delivery for local development & automated test suites
            resendId = `sim_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
            sentSuccess = true;
            console.log(`[EmailService] [Simulated Delivery] To: ${recipient} | Type: ${notificationType} | Subject: ${subject}`);
          } else {
            // Live delivery via Resend REST API
            const response = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                from: config.emailFrom,
                to: recipient,
                subject,
                html,
                text: text || html.replace(/<[^>]*>?/gm, ''),
              }),
            });

            const data = await response.json();

            if (!response.ok) {
              throw new Error(data.message || `Resend HTTP ${response.status}`);
            }

            resendId = data.id;
            sentSuccess = true;
          }
        } catch (err) {
          lastError = err.message;
          console.warn(`[EmailService] Attempt ${attempts} failed for ${recipient}: ${err.message}`);
          if (attempts <= maxRetries) {
            // Short backoff before retry (50ms - 200ms)
            await new Promise((r) => setTimeout(r, attempts * 50));
          }
        }
      }

      // 3. Update log with final delivery status
      if (log) {
        try {
          log.status = sentSuccess ? 'sent' : 'failed';
          log.attemptCount = attempts;
          log.resendId = resendId;
          log.error = sentSuccess ? null : lastError;
          log.sentAt = sentSuccess ? new Date() : null;
          await log.save();
        } catch (e) {
          console.error('[EmailService] Failed to update notification log:', e.message);
        }
      }

      results.push({
        recipient,
        success: sentSuccess,
        resendId,
        error: sentSuccess ? null : lastError,
        logId: log?._id,
      });
    }

    return {
      success: results.every((r) => r.success),
      results,
    };
  },
};

