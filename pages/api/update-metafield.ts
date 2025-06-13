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
    'self_birth_date',
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

  try {
    // 並行更新所有存在的欄位到 metafield
    await Promise.all(
      Object.keys(valueObj).map(async (key) => {
        const metafieldKey = key;
        const valueType = (valueTypes as Record<string, string>)[key] || 'single_line_text_field';
        let metafieldValue: string = valueObj[key];
        const metafieldNamespace = namespace;
        // 特殊処理 self_birth_date
        if (key === 'self_birth_date') {
          // birth_dateを保存
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

          // birth_dateを保存
          const birthDateMetafield = {
            metafield: {
              namespace: 'facts',
              key: 'birth_date',
              value: metafieldValue,
              type: 'date',
            },
          };

          // ageを保存
          const ageMetafield = {
            metafield: {
              namespace: 'custom',
              key: 'age',
              value: age.toString(),
              type: 'number_integer',
            },
          };

          // 両方のメタフィールドを保存
          const [birthDateExisting, ageExisting] = allMetafields.filter(
            (metafield: { namespace: string; key: string; id: string }) => 
              (metafield.namespace === 'facts' && metafield.key === 'birth_date') ||
              (metafield.namespace === 'custom' && metafield.key === 'age')
          );

          // birth_dateの保存
          const birthDateUrl = birthDateExisting?.id
            ? `https://${SHOPIFY_SHOP_DOMAIN}/admin/api/2025-04/metafields/${birthDateExisting.id}.json`
            : `https://${SHOPIFY_SHOP_DOMAIN}/admin/api/2025-04/customers/${customerId}/metafields.json`;
          const birthDateMethod = birthDateExisting?.id ? 'PUT' : 'POST';

          // ageの保存
          const ageUrl = ageExisting?.id
            ? `https://${SHOPIFY_SHOP_DOMAIN}/admin/api/2025-04/metafields/${ageExisting.id}.json`
            : `https://${SHOPIFY_SHOP_DOMAIN}/admin/api/2025-04/customers/${customerId}/metafields.json`;
          const ageMethod = ageExisting?.id ? 'PUT' : 'POST';

          await Promise.all([
            fetch(birthDateUrl, {
              method: birthDateMethod,
              headers: {
                'X-Shopify-Access-Token': SHOPIFY_ADMIN_API_TOKEN as string,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(birthDateMetafield),
            }),
            fetch(ageUrl, {
              method: ageMethod,
              headers: {
                'X-Shopify-Access-Token': SHOPIFY_ADMIN_API_TOKEN as string,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(ageMetafield),
            })
          ]);

          return;
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
          (metafield: { namespace: string; key: string; id: string }) => metafield.namespace === metafieldNamespace && metafield.key === metafieldKey
        );
        const metafieldId = existingMetafield?.id;
        const url = metafieldId
          ? `https://${SHOPIFY_SHOP_DOMAIN}/admin/api/2025-04/metafields/${metafieldId}.json`
          : `https://${SHOPIFY_SHOP_DOMAIN}/admin/api/2025-04/customers/${customerId}/metafields.json`;
        const method = metafieldId ? 'PUT' : 'POST';
        console.log('metafieldPayload:', {
          namespace: metafieldNamespace,
          key: metafieldKey,
          value: metafieldValue,
          type: valueType,
        });
        const metafieldPayload = {
          metafield: {
            namespace: metafieldNamespace,
            key: metafieldKey,
            value: metafieldValue,
            type: valueType,
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
        console.log('Metafield update response:', {
          key: metafieldKey,
          status: shopifyRes.status,
          data: data
        });
        if (!shopifyRes.ok) {
          throw new Error(JSON.stringify(data.errors || data));
        }
      })
    );

    res.status(200).json({ tags });
  } catch (error) {
    console.error('Error updating metafields:', error);
    res.status(500).json({ 
      error: 'Failed to update metafields',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
