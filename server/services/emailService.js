const nodemailer = require('nodemailer');
const loggerModule = require('../utils/logger');

class EmailService {
  constructor() {
    this.transporter = null;
    this.initializeTransporter();
  }

  initializeTransporter() {
    try {
      // 根据环境变量配置邮件传输器
      if (process.env.EMAIL_SERVICE === 'gmail') {
        this.transporter = nodemailer.createTransporter({
          service: 'gmail',
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASSWORD
          }
        });
      } else if (process.env.SMTP_HOST) {
        this.transporter = nodemailer.createTransporter({
          host: process.env.SMTP_HOST,
          port: process.env.SMTP_PORT || 587,
          secure: process.env.SMTP_SECURE === 'true',
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASSWORD
          }
        });
      } else {
        // 开发环境使用 Ethereal Email 测试服务
        console.log('No email configuration found, using test account for development');
        this.createTestAccount();
      }
    } catch (error) {
      loggerModule.errorLogger('Failed to initialize email transporter', error);
    }
  }

  async createTestAccount() {
    try {
      const testAccount = await nodemailer.createTestAccount();
      this.transporter = nodemailer.createTransporter({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass
        }
      });
      console.log('Test email account created:', testAccount.user);
    } catch (error) {
      loggerModule.error('Failed to create test email account', error);
    }
  }

  async sendVerificationEmail(email, verificationToken) {
    if (!this.transporter) {
      console.log('Email service not configured, skipping verification email');
      return;
    }

    const verificationUrl = `${process.env.CLIENT_URL || 'http://localhost:3000'}/verify-email?token=${verificationToken}`;
    
    const mailOptions = {
      from: process.env.EMAIL_FROM || 'noreply@myai.com',
      to: email,
      subject: '验证您的邮箱地址 - MyAI',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">欢迎使用 MyAI！</h2>
          <p>感谢您注册 MyAI 账户。请点击下面的链接验证您的邮箱地址：</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${verificationUrl}" 
               style="background-color: #007bff; color: white; padding: 12px 24px; 
                      text-decoration: none; border-radius: 5px; display: inline-block;">
              验证邮箱
            </a>
          </div>
          <p style="color: #666; font-size: 14px;">
            如果按钮无法点击，请复制以下链接到浏览器地址栏：<br>
            <a href="${verificationUrl}">${verificationUrl}</a>
          </p>
          <p style="color: #666; font-size: 12px;">
            此链接将在24小时后过期。如果您没有注册 MyAI 账户，请忽略此邮件。
          </p>
        </div>
      `
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      loggerModule.businessLogger(null, 'verification_email_sent', 'email', null, {
        email,
        messageId: info.messageId
      });
      
      // 开发环境显示预览链接
      if (process.env.NODE_ENV === 'development') {
        console.log('Verification email sent:', nodemailer.getTestMessageUrl(info));
      }
      
      return info;
    } catch (error) {
      loggerModule.errorLogger('Failed to send verification email', error, { email });
      throw error;
    }
  }

  async sendPasswordResetEmail(email, resetToken) {
    if (!this.transporter) {
      console.log('Email service not configured, skipping password reset email');
      return;
    }

    const resetUrl = `${process.env.CLIENT_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;
    
    const mailOptions = {
      from: process.env.EMAIL_FROM || 'noreply@myai.com',
      to: email,
      subject: '重置您的密码 - MyAI',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">密码重置请求</h2>
          <p>我们收到了您的密码重置请求。请点击下面的链接重置您的密码：</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" 
               style="background-color: #dc3545; color: white; padding: 12px 24px; 
                      text-decoration: none; border-radius: 5px; display: inline-block;">
              重置密码
            </a>
          </div>
          <p style="color: #666; font-size: 14px;">
            如果按钮无法点击，请复制以下链接到浏览器地址栏：<br>
            <a href="${resetUrl}">${resetUrl}</a>
          </p>
          <p style="color: #666; font-size: 12px;">
            此链接将在1小时后过期。如果您没有请求重置密码，请忽略此邮件。
          </p>
          <p style="color: #666; font-size: 12px;">
            为了您的账户安全，请不要将此链接分享给他人。
          </p>
        </div>
      `
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      loggerModule.businessLogger(null, 'password_reset_email_sent', 'email', null, {
        email,
        messageId: info.messageId
      });
      
      // 开发环境显示预览链接
      if (process.env.NODE_ENV === 'development') {
        console.log('Password reset email sent:', nodemailer.getTestMessageUrl(info));
      }
      
      return info;
    } catch (error) {
      loggerModule.errorLogger('Failed to send password reset email', error, { email });
      throw error;
    }
  }

  async sendWelcomeEmail(email, username) {
    if (!this.transporter) {
      console.log('Email service not configured, skipping welcome email');
      return;
    }

    const mailOptions = {
      from: process.env.EMAIL_FROM || 'noreply@myai.com',
      to: email,
      subject: '欢迎加入 MyAI！',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">欢迎加入 MyAI，${username}！</h2>
          <p>您的账户已成功验证，现在可以开始使用 MyAI 的所有功能了。</p>
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <h3 style="color: #333; margin-top: 0;">您可以使用以下功能：</h3>
            <ul style="color: #666;">
              <li>智能对话 - 与多种AI模型进行对话</li>
              <li>文档上传 - 上传并分析各种文档</li>
              <li>知识库管理 - 构建您的专属知识库</li>
              <li>RAG检索 - 基于文档的智能问答</li>
            </ul>
          </div>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.CLIENT_URL || 'http://localhost:3000'}" 
               style="background-color: #28a745; color: white; padding: 12px 24px; 
                      text-decoration: none; border-radius: 5px; display: inline-block;">
              开始使用 MyAI
            </a>
          </div>
          <p style="color: #666; font-size: 12px;">
            如果您有任何问题或需要帮助，请随时联系我们的支持团队。
          </p>
        </div>
      `
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      loggerModule.businessLogger(null, 'welcome_email_sent', 'email', null, {
        email,
        username,
        messageId: info.messageId
      });
      
      return info;
    } catch (error) {
      loggerModule.errorLogger('Failed to send welcome email', error, { email, username });
      // 欢迎邮件发送失败不应该影响主流程
    }
  }
}

module.exports = new EmailService();