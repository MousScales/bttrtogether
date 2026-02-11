# Stripe Payment System Setup

## Database Schema Updates

Run these SQL commands in Supabase SQL Editor:

### Step 1: Create group_goal_participants table
```sql
-- Create group_goal_participants table
create table public.group_goal_participants (
  id uuid default gen_random_uuid() primary key,
  goal_list_id uuid references public.goal_lists(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  joined_at timestamp with time zone default timezone('utc'::text, now()) not null,
  payment_status text default 'pending' check (payment_status in ('pending', 'paid', 'failed')),
  unique(goal_list_id, user_id)
);

-- Enable RLS
alter table public.group_goal_participants enable row level security;

-- Create policies
create policy "Users can view participants of their goal lists" on public.group_goal_participants
  for select using (
    auth.uid() = user_id OR 
    auth.uid() IN (SELECT user_id FROM public.goal_lists WHERE id = goal_list_id)
  );

create policy "Users can join goal lists" on public.group_goal_participants
  for insert with check (auth.uid() = user_id);

create policy "Users can update their own participation" on public.group_goal_participants
  for update using (auth.uid() = user_id);
```

### Step 2: Create payments table
```sql
-- Create payments table
create table public.payments (
  id uuid default gen_random_uuid() primary key,
  goal_list_id uuid references public.goal_lists(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  amount numeric not null,
  stripe_payment_intent_id text unique,
  status text default 'pending' check (status in ('pending', 'succeeded', 'failed', 'refunded')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table public.payments enable row level security;

-- Create policies
create policy "Users can view payments for their goal lists" on public.payments
  for select using (
    auth.uid() = user_id OR 
    auth.uid() IN (SELECT user_id FROM public.goal_lists WHERE id = goal_list_id)
  );

create policy "Users can create their own payments" on public.payments
  for insert with check (auth.uid() = user_id);

create policy "Users can update their own payments" on public.payments
  for update using (auth.uid() = user_id);
```

### Step 3: Create payouts table
```sql
-- Create payouts table
create table public.payouts (
  id uuid default gen_random_uuid() primary key,
  goal_list_id uuid references public.goal_lists(id) on delete cascade not null,
  winner_id uuid references auth.users(id) on delete cascade not null,
  total_amount numeric not null,
  stripe_payout_id text,
  status text default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  completed_at timestamp with time zone
);

-- Enable RLS
alter table public.payouts enable row level security;

-- Create policies
create policy "Users can view payouts for their goal lists" on public.payouts
  for select using (
    auth.uid() = winner_id OR 
    auth.uid() IN (SELECT user_id FROM public.goal_lists WHERE id = goal_list_id)
  );

create policy "Users can create payouts for their goal lists" on public.payouts
  for insert with check (
    auth.uid() IN (SELECT user_id FROM public.goal_lists WHERE id = goal_list_id)
  );
```

### Step 4: Update goal_lists table
```sql
-- Add columns to track payment status
alter table public.goal_lists
  add column if not exists total_pot numeric default 0,
  add column if not exists payment_required boolean default false,
  add column if not exists all_paid boolean default false,
  add column if not exists winner_id uuid references auth.users(id);
```

## Backend API Endpoints Required

You'll need to create these endpoints on your backend server:

### 1. Create Payment Intent (POST /api/create-payment-intent)
```javascript
// Node.js/Express example
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

app.post('/api/create-payment-intent', async (req, res) => {
  const { goal_list_id, amount, user_id } = req.body;
  
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: 'usd',
      metadata: {
        goal_list_id,
        user_id,
      },
    });

    res.json({ 
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

### 2. Confirm Payment (POST /api/confirm-payment)
```javascript
app.post('/api/confirm-payment', async (req, res) => {
  const { payment_intent_id, goal_list_id, user_id } = req.body;
  
  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(payment_intent_id);
    
    if (paymentIntent.status === 'succeeded') {
      // Update payment status in database
      // Update participant payment_status to 'paid'
      // Update goal_list total_pot
      // Check if all participants paid, update all_paid flag
      
      res.json({ success: true, paymentIntent });
    } else {
      res.status(400).json({ error: 'Payment not completed' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

### 3. Create Payout (POST /api/create-payout)
```javascript
app.post('/api/create-payout', async (req, res) => {
  const { goal_list_id, winner_id, amount } = req.body;
  
  try {
    // Get winner's Stripe account ID (they need to connect their account first)
    // For now, we'll use Stripe Connect or transfer to their default payment method
    
    // Option 1: Transfer to connected account
    const transfer = await stripe.transfers.create({
      amount: Math.round(amount * 100),
      currency: 'usd',
      destination: 'acct_xxx', // Winner's connected account
    });

    // Option 2: Or create a payout to their bank account
    // This requires the winner to have added a bank account
    
    // Update payout status in database
    res.json({ success: true, transfer });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

### 4. Webhook Handler (POST /api/webhook)
```javascript
app.post('/api/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'payment_intent.succeeded':
      const paymentIntent = event.data.object;
      // Update payment status in database
      break;
    case 'payment_intent.payment_failed':
      // Handle failed payment
      break;
    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  res.json({ received: true });
});
```

## Environment Variables Needed

On your backend server, set these environment variables:
```
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key_here
STRIPE_WEBHOOK_SECRET=whsec_xxx (get this from Stripe Dashboard > Webhooks)
```

## Stripe Dashboard Setup

1. Go to https://dashboard.stripe.com/test/webhooks
2. Click "Add endpoint"
3. Enter your webhook URL: `https://your-backend.com/api/webhook`
4. Select events:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `transfer.created`
   - `payout.paid`
5. Copy the webhook signing secret to your environment variables

## Testing

Use Stripe test cards:
- Success: `4242 4242 4242 4242`
- Decline: `4000 0000 0000 0002`
- Requires 3D Secure: `4000 0025 0000 3155`

Any future expiry date and any 3-digit CVC will work.



