# Install Supabase CLI on Windows

## Option 1: Using Scoop (Recommended)

### Step 1: Install Scoop (if you don't have it)
Open PowerShell and run:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
irm get.scoop.sh | iex
```

### Step 2: Add Supabase bucket
```powershell
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
```

### Step 3: Install Supabase CLI
```powershell
scoop install supabase
```

---

## Option 2: Using Chocolatey

If you have Chocolatey installed:
```powershell
choco install supabase
```

---

## Option 3: Download Binary Directly

1. Go to: https://github.com/supabase/cli/releases/latest
2. Download: `supabase_windows_amd64.zip`
3. Extract the zip file
4. Add the extracted folder to your PATH, or move `supabase.exe` to a folder that's already in your PATH

---

## Option 4: Use npx (Temporary - Not Recommended)

You can use npx to run commands without installing:
```powershell
npx supabase@latest login
npx supabase@latest link --project-ref YOUR_PROJECT_REF
npx supabase@latest secrets set STRIPE_SECRET_KEY=your_key
npx supabase@latest functions deploy create-payment-intent
```

But you'll need to use `npx supabase@latest` before every command.

---

## After Installation

Once installed, verify it works:
```powershell
supabase --version
```

Then continue with the setup:
```powershell
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase secrets set STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key_here
supabase functions deploy create-payment-intent
```



