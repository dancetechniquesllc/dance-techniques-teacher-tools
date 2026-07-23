import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type JsonRecord = Record<string, any>;

const jsonHeaders = { "content-type": "application/json" };
const clean = (value: unknown) => String(value ?? "").trim();
const numberValue = (value: unknown) => {
  const parsed = Number(typeof value === "object" && value ? (value as JsonRecord).amount : value);
  return Number.isFinite(parsed) ? parsed : null;
};
const timestamp = (value: unknown) => {
  if (!value) return null;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString();
};

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response(JSON.stringify({ ok: false }), { status: 405, headers: jsonHeaders });

  try {
    const wixApiKey = Deno.env.get("WIX_API_KEY");
    const wixSiteId = Deno.env.get("WIX_SITE_ID");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!wixApiKey || !wixSiteId) throw new Error("Wix API key or Site ID is not configured");
    if (!supabaseUrl || !serviceRoleKey) throw new Error("Supabase function environment is incomplete");

    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const expectedSecret = Deno.env.get("WIX_SYNC_SECRET") || "";
    const suppliedSecret = request.headers.get("x-wix-sync-secret") || new URL(request.url).searchParams.get("secret") || "";
    if (!expectedSecret || suppliedSecret !== expectedSecret) {
      const token = clean(request.headers.get("authorization")).replace(/^Bearer\s+/i, "");
      const { data: userResult } = token ? await supabase.auth.getUser(token) : { data: { user: null } };
      const { data: profile } = userResult.user
        ? await supabase.from("profiles").select("role").eq("id", userResult.user.id).maybeSingle()
        : { data: null };
      if (!profile || !["admin", "director"].includes(profile.role)) {
        return new Response(JSON.stringify({ ok: false }), { status: 401, headers: jsonHeaders });
      }
    }

    const input = await request.json().catch(() => ({})) as JsonRecord;
    const limit = Math.min(Math.max(Number(input.limit) || 100, 1), 100);
    const wixResponse = await fetch("https://www.wixapis.com/ecom/v1/orders/search", {
      method: "POST",
      headers: {
        "Authorization": wixApiKey,
        "wix-site-id": wixSiteId,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        search: {
          filter: { status: "APPROVED" },
          sort: [{ fieldName: "createdDate", order: "DESC" }],
          cursorPaging: { limit, ...(input.cursor ? { cursor: clean(input.cursor) } : {}) }
        }
      })
    });
    if (!wixResponse.ok) {
      const wixError = (await wixResponse.text()).slice(0, 500).replace(/[A-Za-z0-9_-]{24,}/g, "[redacted]");
      throw new Error(`Wix order search failed (${wixResponse.status}): ${wixError}`);
    }
    const payload = await wixResponse.json() as JsonRecord;
    const orders = Array.isArray(payload.orders) ? payload.orders as JsonRecord[] : [];
    const { data: syncState } = await supabase.from("wix_sync_state").select("go_live_at").eq("id", "boutique_orders").maybeSingle();
    const goLiveAt = syncState?.go_live_at ? new Date(syncState.go_live_at).valueOf() : Date.now();
    let imported = 0;
    let created = 0;
    let refreshed = 0;

    for (const order of orders) {
      const wixOrderId = clean(order.id || order._id);
      if (!wixOrderId) continue;
      const { data: existingOrder, error: existingOrderError } = await supabase.from("boutique_orders")
        .select("id").eq("wix_order_id", wixOrderId).maybeSingle();
      if (existingOrderError) throw new Error(`Boutique order duplicate check failed: ${existingOrderError.code}`);
      const orderCreatedAt = timestamp(order.createdDate || order._createdDate);
      if (!existingOrder && (!orderCreatedAt || new Date(orderCreatedAt).valueOf() < goLiveAt)) continue;
      const contact = order.billingInfo?.contactDetails || order.recipientInfo?.contactDetails || {};
      const total = order.priceSummary?.total || order.balanceSummary?.balance;
      const orderRow = {
        wix_order_id: wixOrderId,
        wix_order_number: clean(order.number) || null,
        wix_status: clean(order.status) || null,
        payment_status: clean(order.paymentStatus) || null,
        fulfillment_status: clean(order.fulfillmentStatus) || null,
        buyer_first_name: clean(contact.firstName) || null,
        buyer_last_name: clean(contact.lastName) || null,
        buyer_email: clean(order.buyerInfo?.email || contact.email).toLowerCase() || null,
        buyer_phone: clean(contact.phone) || null,
        currency: clean(total?.currency || order.currency) || null,
        total: numberValue(total),
        wix_created_at: timestamp(order.createdDate || order._createdDate),
        wix_updated_at: timestamp(order.updatedDate || order._updatedDate),
        last_synced_at: new Date().toISOString(),
        raw_order: order
      };
      const { data: savedOrder, error: orderError } = await supabase.from("boutique_orders")
        .upsert(orderRow, { onConflict: "wix_order_id" }).select("id").single();
      if (orderError || !savedOrder) throw new Error(`Boutique order upsert failed: ${orderError?.code || "unknown"}`);

      const lineItems = Array.isArray(order.lineItems) ? order.lineItems as JsonRecord[] : [];
      const itemRows = lineItems.map((item, index) => ({
        boutique_order_id: savedOrder.id,
        wix_line_item_id: clean(item.id || item._id || item.lineItemId) || `${wixOrderId}:${index}`,
        product_id: clean(item.catalogReference?.catalogItemId || item.productId) || null,
        variant_id: clean(item.catalogReference?.options?.variantId || item.variantId) || null,
        name: clean(item.productName?.original || item.productName?.translated || item.name) || "Boutique item",
        description: clean(item.descriptionLines?.map((line: JsonRecord) => line.name?.original || line.name?.translated || line.plainText?.original).filter(Boolean).join(" · ")) || null,
        quantity: Math.max(Number(item.quantity) || 1, 1),
        price: numberValue(item.price || item.priceInfo?.price),
        image_url: clean(item.image?.url || item.mediaItem?.url) || null,
        options: item.catalogReference?.options || item.options || {}
      }));
      if (itemRows.length) {
        const { error: itemError } = await supabase.from("boutique_order_items")
          .upsert(itemRows, { onConflict: "boutique_order_id,wix_line_item_id" });
        if (itemError) throw new Error(`Boutique order item upsert failed: ${itemError.code}`);
      }
      imported += 1;
      if (existingOrder) refreshed += 1;
      else created += 1;
    }

    return new Response(JSON.stringify({
      ok: true,
      imported,
      created,
      refreshed,
      nextCursor: payload.metadata?.cursors?.next || null
    }), { status: 200, headers: jsonHeaders });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Wix sync error";
    console.error("Wix order sync failed", { message });
    return new Response(JSON.stringify({ ok: false, error: message }), { status: 500, headers: jsonHeaders });
  }
});
