// /api/calcShipping.ts
export default async function handler(req, res) {
    /* ----------- CORS ----------- */
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST')
        return res.status(405).json({
            error: 'Only POST allowed'
        });

    try {
        /* ----------- валидация ----------- */
        const {
            boxes,
            postcode,
            address,
            city = ''
        } = req.body;
        if (
            !Number.isInteger(boxes) ||
            boxes < 1 ||
            typeof postcode !== 'string' ||
            typeof address !== 'string' ||
            typeof city !== 'string'
        )
            return res.status(400).json({
                error: 'Invalid payload'
            });

        /* ----------- разбор адреса на улицу / номер ----------- */
        const [, street = address, building_number = ''] =
        address.match(/^(.+?)\s+(\S+)$/) || [];

        /* ----------- auth ----------- */
        const token = process.env.SHIPX_API_TOKEN;
        const orgId = process.env.SHIPX_ORGANIZATION_ID;
        if (!token || !orgId)
            throw new Error('Missing SHIPX_API_TOKEN or SHIPX_ORGANIZATION_ID');

        /* ----------- один шаблон parcel ----------- */
        const parcels = [{
            template: 'large'
        }]; // small | medium | large

        /* ----------- формируем массив отправлений ----------- */
        const shipments = Array.from({
            length: boxes
        }, (_, i) => ({
            id: `BOX${i + 1}`,
            receiver: {
                address: {
                    country_code: 'PL',
                    post_code: postcode,
                    city,
                    street,
                    building_number,
                },
                email: 'test@example.com',
                phone: '500600700',
            },
            parcels,
            service: 'inpost_locker_standard',
        }));

        /* ----------- запрос в ShipX ----------- */
        const shipx = await fetch(
            `https://api-shipx-pl.easypack24.net/v1/organizations/${orgId}/shipments/calculate`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    shipments
                }),
            },
        );

        /* ----------- если ShipX вернул 4xx/5xx, отдаём ту же ошибку наружу ----------- */
        if (!shipx.ok) {
            const body = await shipx.text(); // text/plain или JSON
            console.error('ShipX response', shipx.status, body);
            return res.status(shipx.status).type('application/json').send(body);
        }

        /* ----------- всё ок ----------- */
        const offers = await shipx.json();
        const shippingCost = offers.reduce(
            (sum, o) => sum + parseFloat(o.calculated_charge_amount || 0),
            0,
        );

        return res.status(200).json({
            shippingCost
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({
            error: err.message
        });
    }
}