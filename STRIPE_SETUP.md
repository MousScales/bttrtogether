# Stripe Integration Setup

Stripe has been configured for your React Native app using test keys.

## Configuration

- **Publishable Key**: Configured in `lib/stripe.js` and used in `App.js`
- **Secret Key**: Should be stored securely on your backend server (never in the app)

## Usage Examples

### 1. Using Payment Sheet (Recommended for React Native)

```javascript
import { useStripe } from '@stripe/stripe-react-native';

function PaymentScreen() {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  const handlePayment = async () => {
    // First, create a PaymentIntent on your backend
    // Then initialize the payment sheet
    const { error: initError } = await initPaymentSheet({
      paymentIntentClientSecret: 'pi_xxx_secret_xxx', // From your backend
      merchantDisplayName: 'Bttr Together',
    });

    if (initError) {
      console.error('Payment sheet initialization failed:', initError);
      return;
    }

    // Present the payment sheet
    const { error: presentError } = await presentPaymentSheet();
    
    if (presentError) {
      console.error('Payment failed:', presentError);
    } else {
      console.log('Payment successful!');
    }
  };

  return (
    <Button onPress={handlePayment} title="Pay" />
  );
}
```

### 2. Using Payment Element (for custom UI)

```javascript
import { CardField, useStripe } from '@stripe/stripe-react-native';

function CustomPaymentScreen() {
  const { confirmPayment } = useStripe();

  const handlePayment = async () => {
    const { error, paymentIntent } = await confirmPayment(
      'pi_xxx_secret_xxx', // From your backend
      {
        paymentMethodType: 'Card',
      }
    );

    if (error) {
      console.error('Payment failed:', error);
    } else {
      console.log('Payment successful!', paymentIntent);
    }
  };

  return (
    <View>
      <CardField
        postalCodeEnabled={false}
        placeholders={{
          number: '4242 4242 4242 4242',
        }}
        cardStyle={{
          backgroundColor: '#FFFFFF',
          textColor: '#000000',
        }}
        style={{ width: '100%', height: 50 }}
      />
      <Button onPress={handlePayment} title="Pay" />
    </View>
  );
}
```

## Backend Setup Required

You'll need to create a backend endpoint to:
1. Create PaymentIntents
2. Handle webhooks
3. Process payments securely using the secret key

### Example Backend Endpoint (Node.js/Express)

```javascript
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

app.post('/create-payment-intent', async (req, res) => {
  const { amount, currency = 'usd' } = req.body;

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount * 100, // Convert to cents
      currency: currency,
    });

    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

## Security Notes

⚠️ **IMPORTANT**: 
- Never expose your secret key in the app
- Always create PaymentIntents on your backend
- Validate payments on your backend using webhooks
- Use HTTPS in production

## Test Cards

Use these test card numbers for testing:
- Success: `4242 4242 4242 4242`
- Decline: `4000 0000 0000 0002`
- Requires 3D Secure: `4000 0025 0000 3155`

Any future expiry date and any 3-digit CVC will work.




