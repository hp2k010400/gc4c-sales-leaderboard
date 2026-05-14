const { getStore, configure } = require('@netlify/blobs');

const STORE_DOMAIN = process.env.SHOPIFY_STORE;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const LOCATION_NAMES = ['Edinburgh', 'Warrington', 'Milton Keynes', 'Southampton'];

configure({
  siteID: process.env.NETLIFY_SITE_ID,
  token: process.env.NETLIFY_TOKEN,
});

async function shopifyGet(path) {
  const res = await fetch(`https://${STORE_DOMAIN}/admin/api/2024-01/${path}`, {
    headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN },
  });
  if (!res.ok) throw new Error(`Shopify ${path} → ${res.status}`);
  return res.json();
}

function getMondayISO() {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString();
}

async function getLocationRevenue(locationId, mondayISO) {
  let revenue = 0;
  let pageInfo = null;

  do {
    let endpoint;
    if (pageInfo) {
      endpoint = `orders.json?limit=250&page_info=${pageInfo}`;
    } else {
      endpoint = `orders.json?location_id=${locationId}&created_at_min=${encodeURIComponent(mondayISO)}&financial_status=paid&status=any&limit=250`;
    }

    const res = await fetch(`https://${STORE_DOMAIN}/admin/api/2024-01/${endpoint}`, {
      headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN },
    });
    if (!res.ok) throw new Error(`Orders fetch failed: ${res.status}`);

    const data = await res.json();
    for (const order of data.orders) {
      revenue += parseFloat(order.total_price || 0);
    }

    const linkHeader = res.headers.get('Link') || '';
    const match = linkHeader.match(/<[^>]*[?&]page_info=([^&>]+)[^>]*>;\s*rel="next"/);
    pageInfo = match ? match[1] : null;
  } while (pageInfo);

  return revenue;
}

exports.handler = async () => {
  try {
    const locData = await shopifyGet('locations.json');
    const locationMap = {};
    for (const loc of locData.locations) {
      if (LOCATION_NAMES.includes(loc.name)) {
        locationMap[loc.name] = loc.id;
      }
    }

    const mondayISO = getMondayISO();

    const locations = await Promise.all(
      LOCATION_NAMES.map(async (name) => {
        const id = locationMap[name];
        if (!id) return { name, revenue: 0 };
        const revenue = await getLocationRevenue(id, mondayISO);
        return { name, revenue };
      })
    );

    const store = getStore('sales-leaderboard');
    await store.setJSON('current', {
      locations,
      weekStart: mondayISO,
      updated: new Date().toISOString(),
    });

    return { statusCode: 200, body: JSON.stringify({ ok: true, locations }) };
  } catch (err) {
    console.error('daily-refresh failed:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
