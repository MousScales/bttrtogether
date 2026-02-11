# Complete Payment System Setup Guide

## ✅ What's Been Implemented

### 1. **Database Schema** (`STRIPE_PAYMENT_SETUP.md`)
   - `group_goal_participants` table - tracks who joined group goals
   - `payments` table - tracks all payments
   - `payouts` table - tracks winner payouts
   - Updated `goal_lists` table with payment tracking fields

### 2. **New Screens Created**
   - `AddFriendsToGoalScreen.js` - Select friends to add to group goals
   - `GroupGoalPaymentScreen.js` - Payment screen for joining group challenges
   - `PayoutScreen.js` - Screen for winners to claim their winnings

### 3. **Updated Screens**
   - `CreateGoalListScreen.js` - Now includes friend selection after bet amount
   - `App.js` - Added all new screens to navigation

### 4. **Stripe Integration**
   - Stripe provider configured in `App.js`
   - Payment screens ready to use Stripe Payment Sheet

## 📋 What You Need to Do

### Step 1: Run Database Schema (CRITICAL - Do This First!)

1. Go to your Supabase Dashboard
2. Click "SQL Editor" in the left sidebar
3. Click "New Query"
4. Copy and paste **each section** from `STRIPE_PAYMENT_SETUP.md` (one at a time):
   - Step 1: Create `group_goal_participants` table
   - Step 2: Create `payments` table
   - Step 3: Create `payouts` table
   - Step 4: Update `goal_lists` table
5. Click "Run" for each query
6. Verify all tables are created in "Table Editor"

### Step 2: Set Up Your Backend Server

You need to create a backend server (Node.js/Express, Python/Flask, etc.) with these endpoints:

#### Required Endpoints:

1. **POST /api/create-payment-intent**
   - Creates a Stripe PaymentIntent
   - Returns `clientSecret` for the payment sheet
   - See `STRIPE_PAYMENT_SETUP.md` for code example

2. **POST /api/confirm-payment**
   - Confirms payment after Stripe processes it
   - Updates database: payment status, participant status, total pot
   - Checks if all participants paid

3. **POST /api/create-payout**
   - Processes payout to winner
   - Transfers funds to winner's account
   - Updates payout status in database

4. **POST /api/webhook**
   - Handles Stripe webhooks
   - Processes payment events automatically

#### Environment Variables Needed:
```
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key_here
STRIPE_WEBHOOK_SECRET=whsec_xxx (get from Stripe Dashboard)
```

### Step 3: Update Backend URLs in App

In these files, replace `BACKEND_URL` with your actual backend URL:

1. **`screens/GroupGoalPaymentScreen.js`** (line 12)
   ```javascript
   const BACKEND_URL = 'https://your-backend.com/api';
   ```

2. **`screens/PayoutScreen.js`** (line 12)
   ```javascript
   const BACKEND_URL = 'https://your-backend.com/api';
   ```

### Step 4: Set Up Stripe Webhooks

1. Go to https://dashboard.stripe.com/test/webhooks
2. Click "Add endpoint"
3. Enter your webhook URL: `https://your-backend.com/api/webhook`
4. Select these events:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `transfer.created`
   - `payout.paid`
5. Copy the webhook signing secret to your backend environment variables

### Step 5: Test the Flow

1. **Create a Group Goal with Bet:**
   - Go to Create Goal List
   - Choose "do it better together"
   - Set bet amount
   - Add friends
   - Complete goal list creation

2. **Join a Group Goal (Payment):**
   - When a friend is invited, they should see the goal
   - They click to join
   - Navigate to `GroupGoalPaymentScreen`
   - Pay the bet amount using Stripe

3. **Claim Winnings (Payout):**
   - When someone wins, navigate to `PayoutScreen` from profile
   - Select payout method
   - Process payout

## 🔄 How the Flow Works

### Creating a Group Goal with Bet:
1. User creates goal list, chooses "do it better together"
2. Sets bet amount (e.g., $10)
3. Adds friends to the challenge
4. Goal list is created with `payment_required: true`
5. All participants (including creator) are added to `group_goal_participants` with `payment_status: 'pending'`

### Joining and Paying:
1. Friend receives notification/invitation (you'll need to implement this)
2. Friend navigates to the goal list
3. Clicks "Join Challenge"
4. Navigates to `GroupGoalPaymentScreen`
5. Backend creates PaymentIntent
6. User pays via Stripe Payment Sheet
7. Backend confirms payment and updates:
   - `payments` table
   - `group_goal_participants.payment_status = 'paid'`
   - `goal_lists.total_pot += amount`
   - Checks if all paid, sets `all_paid = true`

### Determining Winner and Payout:
1. When challenge ends, determine winner (you'll need to implement this logic)
2. Update `goal_lists.winner_id`
3. Winner sees payout option in profile
4. Navigate to `PayoutScreen`
5. Backend processes payout via Stripe
6. Updates `payouts` table

## 🎯 Next Steps to Complete

### 1. Implement Friend Invitations
   - Create notifications system
   - Send invites when goal list is created
   - Show pending invites in Goals screen

### 2. Add Payment Status UI
   - Show payment status in goal list items
   - Show who has paid/who hasn't
   - Block starting challenge until all paid

### 3. Implement Winner Determination
   - Logic to determine winner based on goal completion
   - Update `winner_id` in `goal_lists`
   - Show winner in UI

### 4. Add Payout Button to Profile
   - Check if user has won any challenges
   - Show "Claim Winnings" button
   - Navigate to `PayoutScreen`

### 5. Add Payment History
   - Show payment history in profile
   - Show pending/paid status

## 📝 Important Notes

- **Secret Key**: Never expose your Stripe secret key in the app. Only use it on your backend.
- **Test Mode**: You're using test keys. Switch to live keys when ready for production.
- **Webhooks**: Essential for reliable payment processing. Don't skip this.
- **Security**: Always validate payments on your backend. Don't trust client-side payment status.

## 🐛 Troubleshooting

- **Payment not working**: Check backend URL is correct
- **Webhook errors**: Verify webhook secret matches
- **Database errors**: Make sure all schema updates are run
- **Navigation errors**: Verify all screens are added to App.js

## 📚 Files to Review

- `STRIPE_PAYMENT_SETUP.md` - Database schema and backend code
- `STRIPE_SETUP.md` - Basic Stripe setup guide
- `screens/GroupGoalPaymentScreen.js` - Payment implementation
- `screens/PayoutScreen.js` - Payout implementation
- `screens/AddFriendsToGoalScreen.js` - Friend selection

## ✅ Checklist

- [ ] Run all database schema updates in Supabase
- [ ] Set up backend server with required endpoints
- [ ] Update BACKEND_URL in payment screens
- [ ] Set up Stripe webhooks
- [ ] Test payment flow
- [ ] Test payout flow
- [ ] Implement friend invitations
- [ ] Add payment status UI
- [ ] Implement winner determination
- [ ] Add payout button to profile

---

**Everything is set up on the frontend!** You just need to:
1. Run the database schema
2. Create the backend endpoints
3. Update the backend URLs
4. Test the flow

Good luck! 🚀

