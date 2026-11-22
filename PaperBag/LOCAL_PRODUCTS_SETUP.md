# PaperBag Local Product Setup

## Current mode
- Default mode is `local`.
- Products are loaded from `products.json`.
- You can switch to Firebase mode by running in browser console:
  `localStorage.setItem("paperbag_product_source", "firebase")`

## Add products quickly
1. Open `products.json`.
2. Add a new object with:
   - `id` (unique string)
   - `name`
   - `price` (number)
   - `description`
   - `category`
   - `subCategory` (optional)
   - `image` (local path or external URL)
   - `stock`
3. Save and refresh the store page.

## Local admin helper
- Open `admin-local-products.html`.
- Fill the form and submit.
- The product is saved to browser localStorage and appears instantly in local mode.

## Image paths
- Local: `assets/images/your-image.jpg`
- External: `https://example.com/image.jpg`

## Cart + checkout compatibility
- Guest cart uses `localStorage` key: `guest_cart`.
- Logged-in users use Firestore user cart.
- Checkout keeps using your existing payment processing payment flow.
