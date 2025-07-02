export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') {
        return res.status(405).json({
            error: 'Only POST allowed'
        });
    }

    try {
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
        ) {
            return res.status(400).json({
                error: 'Invalid payload'
            });
        }

        const [, street = address, building_number = ''] = address.match(/^(.+?)\s+(\S+)$/) || [];

        const token = process.env.SHIPX_API_TOKEN;
        const orgId = process.env.SHIPX_ORGANIZATION_ID;
        if (!token || !orgId) {
            throw new Error('Missing SHIPX_API_TOKEN or SHIPX_ORGANIZATION_ID');
        }

        /* ----------- получаем target_point ----------- */
        const pointRes = await fetch(
            `https://api-shipx-pl.easypack24.net/v1/points?city=${encodeURIComponent(city)}&street=${encodeURIComponent(street)}`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        if (!pointRes.ok) {
            const err = await pointRes.text();
            throw new Error('Failed to fetch InPost points: ' + err);
        }

        const points = await pointRes.json();
        const target_point = points[0]?.name;
        if (!target_point) {
            return res.status(400).json({
                error: 'No InPost lockers found for the given address'
            });
        }

        const parcels = [{
            template: 'large'
        }];

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
            custom_attributes: {
                target_point,
            },
            service: 'inpost_locker_standard',
        }));

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
            }
        );

        if (!shipx.ok) {
            const body = await shipx.text();
            console.error('ShipX response', shipx.status, body);
            res.setHeader('Content-Type', 'application/json');
            return res.status(shipx.status).send(body);
        }

        const offers = await shipx.json();
        const shippingCost = offers.reduce(
            (sum, o) => sum + parseFloat(o.calculated_charge_amount || 0),
            0
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