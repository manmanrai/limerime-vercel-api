import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const SHOPIFY_SHOP_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
  const SHOPIFY_ADMIN_API_TOKEN = process.env.SHOPIFY_ADMIN_API_TOKEN;
  const namespace = 'over-30';
  const valueType = 'json';
  const key = 'over-30-key';
  const { customerId, value } = req.body;

  if (!customerId || !namespace || !key || !value || !valueType) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const metafieldPayload = {
    metafield: {
      namespace,
      key,  
      value,
      type: valueType,
    },
  };

  let url = `https://${SHOPIFY_SHOP_DOMAIN}/admin/api/2025-04/customers/${customerId}/metafields.json`;
  let method = 'POST';

  // 取得 customer 的所有 metafields
  const metafieldsRes = await fetch(`https://${SHOPIFY_SHOP_DOMAIN}/admin/api/2025-04/customers/${customerId}/metafields.json`, {
    headers: {
      'X-Shopify-Access-Token': SHOPIFY_ADMIN_API_TOKEN as string,
      'Content-Type': 'application/json',
    },
  });
  const metafieldsData = await metafieldsRes.json();
  const existingMetafield = metafieldsData.metafields.find(
    (metafield: { namespace: string; key: string; id: string }) => metafield.namespace === namespace && metafield.key === key
  );
  const metafieldId = existingMetafield?.id;

  // 如果有 metafieldId，則改為更新
  if (metafieldId) {
    url = `https://${SHOPIFY_SHOP_DOMAIN}/admin/api/2025-04/metafields/${metafieldId}.json`;
    method = 'PUT';
  }

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
    return res.status(shopifyRes.status).json({ error: data.errors || data });
  }

  res.status(200).json(data);
} 