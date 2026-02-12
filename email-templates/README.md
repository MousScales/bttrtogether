# Bttr Together - Email Templates

Branded email templates for Supabase authentication flows.

## Templates Included

1. **confirm-signup.html** - Welcome email with email confirmation
2. **magic-link.html** - Passwordless sign-in link
3. **reset-password.html** - Password reset request
4. **change-email.html** - Confirm new email address
5. **invite-user.html** - Invitation to join the platform
6. **password-changed.html** - Notification of password change
7. **email-changed.html** - Notification of email address change

## Branding

All templates follow the Bttr Together brand identity:
- **Colors**: Black (#000000), Dark Gray (#1a1a1a), Green (#4CAF50), Blue (#2196F3)
- **Logo**: Two figures representing "together"
- **Typography**: System fonts, bold headings, clean layout

## How to Use in Supabase

### Step 1: Access Email Templates

1. Go to your Supabase Dashboard
2. Navigate to **Authentication** → **Email Templates**

### Step 2: Update Each Template

For each email type (Confirm signup, Magic Link, etc.):

1. Click on the template name
2. Copy the corresponding HTML from this folder
3. Paste it into the **Body** field in Supabase
4. Update the **Subject** field with a branded subject line (see below)
5. Click **Save**

### Recommended Subject Lines

- **Confirm signup**: `Welcome to Bttr Together! Confirm your email`
- **Magic Link**: `Sign in to Bttr Together`
- **Reset Password**: `Reset your Bttr Together password`
- **Change Email**: `Confirm your new email address`
- **Invite User**: `You're invited to join Bttr Together!`
- **Password Changed**: `Your Bttr Together password was changed`
- **Email Changed**: `Your Bttr Together email was updated`

## Supabase Variables

These templates use Supabase's built-in variables:

- `{{ .ConfirmationURL }}` - Confirmation/action link
- `{{ .Email }}` - User's email address
- `{{ .NewEmail }}` - New email (for change email template)
- `{{ .SiteURL }}` - Your app's URL
- `{{ .Token }}` - Auth token (if needed)
- `{{ .TokenHash }}` - Token hash (if needed)
- `{{ .Data }}` - Custom data object

## Testing

After updating templates in Supabase:

1. Test each email flow in your app
2. Check that links work correctly
3. Verify branding appears correctly
4. Test on different email clients (Gmail, Outlook, Apple Mail)

## Customization

To customize these templates:

1. Edit the HTML files in this folder
2. Maintain the Supabase variables ({{ .VariableName }})
3. Keep inline CSS for email compatibility
4. Test thoroughly before deploying

## Email Client Compatibility

These templates are designed to work with:
- Gmail
- Apple Mail
- Outlook
- Yahoo Mail
- Mobile email clients

Inline CSS is used for maximum compatibility.

## Support

If you need help with email templates, contact your development team or refer to:
- [Supabase Email Templates Docs](https://supabase.com/docs/guides/auth/auth-email-templates)
