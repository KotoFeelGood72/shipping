// /api/calcShipping.ts
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
            !Number.isInteger(boxes) || boxes < 1 ||
            typeof postcode !== 'string' ||
            typeof address !== 'string' ||
            typeof city !== 'string'
        ) {
            return res.status(400).json({
                error: 'Invalid payload'
            });
        }

        const [, street = address, building_number = ''] =
        address.match(/^(.+?)\s+(\S+)$/) || [];

        const token = 'eyJhbGciOiJSUzI1NiIsInR5cCIgOiAiSldUIiwia2lkIiA6ICJzQlpXVzFNZzVlQnpDYU1XU3JvTlBjRWFveFpXcW9Ua2FuZVB3X291LWxvIn0.eyJleHAiOjIwNjY2NDY2NDksImlhdCI6MTc1MTI4NjY0OSwianRpIjoiNzdjMmNjMmEtYTdiYi00YWZlLWI5MWEtZWYyMmVhMWU1NmFmIiwiaXNzIjoiaHR0cHM6Ly9sb2dpbi5pbnBvc3QucGwvYXV0aC9yZWFsbXMvZXh0ZXJuYWwiLCJzdWIiOiJmOjEyNDc1MDUxLTFjMDMtNGU1OS1iYTBjLTJiNDU2OTVlZjUzNTppS2l4RVVNb0JqbDFUNy12d0U1ZXVBIiwidHlwIjoiQmVhcmVyIiwiYXpwIjoic2hpcHgiLCJzZXNzaW9uX3N0YXRlIjoiMmFkNzJhZjItZTg0NC00ODQxLTkwNjUtM2FkY2NjY2MyZTNkIiwic2NvcGUiOiJvcGVuaWQgYXBpOmFwaXBvaW50cyBhcGk6c2hpcHgiLCJzaWQiOiIyYWQ3MmFmMi1lODQ0LTQ4NDEtOTA2NS0zYWRjY2NjYzJlM2QiLCJhbGxvd2VkX3JlZmVycmVycyI6IiIsInV1aWQiOiJkNzc3OTdiMy1iY2U5LTRkYjctOGEyYi1jNTBkNjY4ODBlNjQiLCJlbWFpbCI6ImluZm9AZnlrLmJhciJ9.m9PINspOAuYeJAyGF9yHi9AqYNHq-EA0CSB3_T7-d0U8LgeRF4R2d32FoNq-rgImgAahZzigRfyuvgWk5vampQRdfjdmxEaA18f8_JNFggNWjHdcIy-xulEyVvnoGHwXoUiCEUbVs8A5FKrSBc7XFuOVE6Rs7jOhI2Bt-Grt3-SMoU52ywAop0IvGzKBqRBbHH_HO3xSt8lKf29QwGLiCu46ryPKCcKGnoYVSqJRCri5GYxbUTfZcsib2EGwfj-pr819x2-qzqUwxpSI7FBGoOxX1hEMpigpzNpDJXrJ8fqb5pwIV_rGEpBPMAAOcKk0IDvoqLj6Z0wP7YjlewhH3w';
        const orgId = '88982';

        if (!token || !orgId) throw new Error('Missing API credentials');

        // Получение target_point
        const pointsRes = await fetch(
            `https://api-shipx-pl.easypack24.net/v1/points?postcode=${encodeURIComponent(postcode)}`
        );
        const pointsData = await pointsRes.json();
        const target_point = pointsData.items?. [0]?.name;

        if (!target_point) {
            return res.status(404).json({
                error: 'No InPost target_point found for this address'
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
            return res.status(shipx.status).send(body);
        }

        const offers = await shipx.json();
        const shippingCost = offers.reduce(
            (sum, o) => sum + parseFloat(o.calculated_charge_amount ?? '0'),
            0
        );

        return res.status(200).json({
            shippingCost,
            offers,
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({
            error: err.message
        });
    }
}