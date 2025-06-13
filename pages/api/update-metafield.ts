import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
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
  const keys = [
    'birth_date',
    'under30_a',
    'under30_a_relationship',
    'under30_a_birth',
    'under30_b',
    'under30_b_relationship',
    'under30_b_birth',
    'under30_c',
    'under30_c_relationship',
    'under30_c_birth',
    'under30_d',
    'under30_d_relationship',
    'under30_d_birth',
  ];
  const valueTypes = {
    'birth_date': 'date',
    'age': "number_integer",
    'under30_a': 'single_line_text_field', 
    'under30_a_relationship': 'list.single_line_text_field',
    'under30_a_birth': 'date',
    'under30_b': 'single_line_text_field', 
    'under30_b_relationship': 'list.single_line_text_field',
    'under30_b_birth': 'date',
    'under30_c': 'single_line_text_field', 
    'under30_c_relationship': 'list.single_line_text_field',
    'under30_c_birth': 'date',
    'under30_d': 'single_line_text_field', 
    'under30_d_relationship': 'list.single_line_text_field',
    'under30_d_birth': 'date',
  };
  const { customerId } = req.body;

  if (!customerId || !namespace) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // 只取出 keys 中存在於 req.body 的欄位
  const valueObj: Record<string, string> = {};
  for (const key of keys) {
    if (req.body[key] !== undefined) {
      valueObj[key] = req.body[key];
    }
  }

  // 檢查是否有小於 30 歲
  let hasUnder30 = false;
  for (const key in valueObj) {
    if (key.endsWith('birth') || key.endsWith('birth_date')) {
      const birthDate = new Date(valueObj[key]);
      const today = new Date();
      // 固定以每年 4/1 為分界
      const thisYear = today.getFullYear();
      const borderMonth = 3; // 4月，JS 月份從0開始
      const borderDay = 1;
      const borderDate = new Date(thisYear, borderMonth, borderDay);
      let age = thisYear - birthDate.getFullYear();
      // 如果生日在今年 4/2 之後，還沒足歲，要減一歲
      const birthThisYear = new Date(thisYear, birthDate.getMonth(), birthDate.getDate());
      if (birthThisYear > borderDate) {
        age--;
      }
      if (age < 30) {
        hasUnder30 = true;
        break;
      }
    }
  }

  // 取得 customer 目前的 tags
  const customerRes = await fetch(`https://${SHOPIFY_SHOP_DOMAIN}/admin/api/2025-04/customers/${customerId}.json`, {
    headers: {
      'X-Shopify-Access-Token': SHOPIFY_ADMIN_API_TOKEN as string,
      'Content-Type': 'application/json',
    },
  });
  const customerData = await customerRes.json();
  let tags = customerData.customer?.tags ? customerData.customer.tags.split(',').map((t: string) => t.trim()) : [];

  // 根據 hasUnder30 新增或移除 under30 tag
  if (hasUnder30) {
    if (!tags.includes('under30')) tags.push('under30');
  } else {
    if (tags.includes('under30')) tags = tags.filter((t: string) => t !== 'under30');
    if (!tags.includes('above30')) tags.push('above30');
  }

  // 更新 customer tags
  await fetch(`https://${SHOPIFY_SHOP_DOMAIN}/admin/api/2025-04/customers/${customerId}.json`, {
    method: 'PUT',
    headers: {
      'X-Shopify-Access-Token': SHOPIFY_ADMIN_API_TOKEN as string,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ customer: { id: customerId, tags: tags.join(', ') } }),
  });

  // 取得 customer 的所有 metafields
  const metafieldsRes = await fetch(`https://${SHOPIFY_SHOP_DOMAIN}/admin/api/2025-04/customers/${customerId}/metafields.json`, {
    headers: {
      'X-Shopify-Access-Token': SHOPIFY_ADMIN_API_TOKEN as string,
      'Content-Type': 'application/json',
    },
  });
  const metafieldsData = await metafieldsRes.json();
  const allMetafields = metafieldsData.metafields || [];

  // 更新前のmetafieldの値をログ出力
  console.log('Before Update Metafields:', allMetafields);

  // 並行更新所有存在的欄位到 metafield
  await Promise.all(
    Object.keys(valueObj).map(async (key) => {
      let metafieldKey = key;
      let valueType = (valueTypes as Record<string, string>)[key] || 'single_line_text_field';
      let metafieldValue: string = valueObj[key];
      // 特殊處理 self_birth_date
      if (key === 'self_birth_date') {
        metafieldKey = 'age';
        valueType = 'number_integer';
        // 計算年齡（同樣以 4/1 為分界）
        const birthDate = new Date(metafieldValue);
        const today = new Date();
        const thisYear = today.getFullYear();
        const borderMonth = 3; // 4月
        const borderDay = 1;
        const borderDate = new Date(thisYear, borderMonth, borderDay);
        let age = thisYear - birthDate.getFullYear();
        const birthThisYear = new Date(thisYear, birthDate.getMonth(), birthDate.getDate());
        if (birthThisYear > borderDate) {
          age--;
        }
        metafieldValue = age.toString();
      }
      if (key.endsWith('_relationship')) {
        // 若值為空字串，存成空陣列
        if (!metafieldValue) {
          metafieldValue = JSON.stringify([]);
        } else {
          metafieldValue = JSON.stringify([metafieldValue]);
        }
      }
      const existingMetafield = allMetafields.find(
        (metafield: { namespace: string; key: string; id: string }) => metafield.namespace === namespace && metafield.key === metafieldKey
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
          namespace: key === 'birth_date' ? 'facts' : 'custom',
          key: metafieldKey,
          value: metafieldValue,
          type: valueType,
        },
      };
      console.log('metafieldPayload', metafieldPayload);
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
        throw new Error(JSON.stringify(data.errors || data));
      }
    })
  );

  // 更新後のmetafieldの値を取得してログ出力
  const updatedMetafieldsRes = await fetch(`https://${SHOPIFY_SHOP_DOMAIN}/admin/api/2025-04/customers/${customerId}/metafields.json`, {
    headers: {
      'X-Shopify-Access-Token': SHOPIFY_ADMIN_API_TOKEN as string,
      'Content-Type': 'application/json',
    },
  });
  const updatedMetafieldsData = await updatedMetafieldsRes.json();
  console.log('After Update Metafields:', updatedMetafieldsData.metafields);

  res.status(200).json({ tags });
} 
