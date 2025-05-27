import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const SHOPIFY_SHOP_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
  const SHOPIFY_ADMIN_API_TOKEN = process.env.SHOPIFY_ADMIN_API_TOKEN;
  const customerId = 8570264879349;

  // 取得 customer 資料
  const customerRes = await fetch(`https://${SHOPIFY_SHOP_DOMAIN}/admin/api/2025-04/customers/${customerId}.json`, {
    headers: {
      'X-Shopify-Access-Token': SHOPIFY_ADMIN_API_TOKEN as string,
      'Content-Type': 'application/json',
    },
  });
  const customerData = await customerRes.json();

  // 取得 customer 的所有 metafields
  const metafieldsRes = await fetch(`https://${SHOPIFY_SHOP_DOMAIN}/admin/api/2025-04/customers/${customerId}/metafields.json`, {
    headers: {
      'X-Shopify-Access-Token': SHOPIFY_ADMIN_API_TOKEN as string,
      'Content-Type': 'application/json',
    },
  });
  const metafieldsData = await metafieldsRes.json();

  res.status(200).json({
    customer: customerData,
    metafields: metafieldsData,
  });
} 