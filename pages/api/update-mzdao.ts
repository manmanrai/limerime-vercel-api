import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const SHOPIFY_SHOP_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
  const SHOPIFY_ADMIN_API_TOKEN = process.env.SHOPIFY_ADMIN_API_TOKEN;
  const namespace = 'custom';
  const key = 'mzdao';
  const { customerId, value } = req.body;

  if (!customerId || value === undefined) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // 取得 customer 的所有 metafields
  const metafieldsRes = await fetch(`https://${SHOPIFY_SHOP_DOMAIN}/admin/api/2025-04/customers/${customerId}/metafields.json`, {
    headers: {
      'X-Shopify-Access-Token': SHOPIFY_ADMIN_API_TOKEN as string,
      'Content-Type': 'application/json',
    },
  });
  const metafieldsData = await metafieldsRes.json();
  const allMetafields = metafieldsData.metafields || [];

  // 檢查是否已存在該 key
  const existingMetafield = allMetafields.find(
    (metafield: { namespace: string; key: string; id: string }) => metafield.namespace === namespace && metafield.key === key
  );
  const metafieldId = existingMetafield?.id;
  let url = `https://${SHOPIFY_SHOP_DOMAIN}/admin/api/2025-04/customers/${customerId}/metafields.json`;
  let method = 'POST';
  if (metafieldId) {
    url = `https://${SHOPIFY_SHOP_DOMAIN}/admin/api/2025-04/metafields/${metafieldId}.json`;
    method = 'PUT';
  }
  const metafieldPayload = {
    metafield: {
      namespace,
      key,
      value,
      type: 'single_line_text_field',
    },
  };
  const shopifyRes = await fetch(url, {
    method,
    headers: {
      'X-Shopify-Access-Token': SHOPIFY_ADMIN_API_TOKEN as string,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(metafieldPayload),
  });
  const data = await shopifyRes.json();
  if (!shopifyRes.ok) {
    return res.status(500).json({ error: data.errors || data });
  }

  res.status(200).json({ success: true, metafield: data.metafield });
} 