# Wix Boutique Integration

## Connection design

The Teacher App imports approved Wix eCommerce orders through the server-side `wix-order-sync` Supabase Edge Function. The Wix API key is never placed in `index.html`, browser storage, or Git.

The importer is safe to run repeatedly:

- `boutique_orders.wix_order_id` is unique.
- `boutique_order_items` is unique per Wix order and line-item ID.
- Existing Wix orders refresh in place instead of duplicating.
- App fulfillment stages (`to_fill`, `to_pick_up`, `to_deliver`, `delivered`) are stored separately from Wix's own payment and fulfillment statuses.

## Wix setup needed

From the Wix account owner's API Keys Manager:

1. Create an API key restricted to the boutique site only.
2. Grant the narrowest available eCommerce **Read Orders** permission.
3. Copy the site's Wix Site ID from the dashboard URL (the value after `/dashboard/`).
4. Do not paste the key into browser code or commit it to Git.

Store these as Supabase Edge Function secrets:

- `WIX_API_KEY`
- `WIX_SITE_ID`
- `WIX_SYNC_SECRET` — a new random secret used only to invoke the sync endpoint

## First safe test

1. Apply migration `20260722100000_wix_boutique_orders.sql`.
2. Deploy the `wix-order-sync` function.
3. Set the three secrets above.
4. Invoke the function with a small limit such as `1`.
5. Verify the buyer, items, quantities, prices, and order number against that Wix order.
6. Re-run the same request and confirm no duplicate order or line items appear.
7. Only then run the historical backfill in pages of up to 100 orders.

No Wix order is modified by this integration stage. Two-way fulfillment updates remain disabled until imported order data and student matching are verified.
