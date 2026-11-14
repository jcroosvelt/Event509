// Essai d'envoi RÉEL d'un code par WhatsApp (à lancer depuis votre ordinateur, jamais en production) :
//   META_ACCESS_TOKEN=... META_PHONE_NUMBER_ID=... node scripts/otp-test-send.mjs +50937123456
// Envoie un code d'essai au numéro indiqué avec le modèle configuré. N'écrit rien dans la base.
const to = (process.argv[2] ?? '').replace(/[^\d]/g, '');
const { META_ACCESS_TOKEN: token, META_PHONE_NUMBER_ID: id } = process.env;
if (!to || !token || !id) {
  console.error('Usage : META_ACCESS_TOKEN=… META_PHONE_NUMBER_ID=… node scripts/otp-test-send.mjs +509XXXXXXXX');
  process.exit(1);
}
const version = process.env.META_GRAPH_API_VERSION || 'v21.0';
const code = String(Math.floor(Math.random() * 1e6)).padStart(6, '0');
const components = [{ type: 'body', parameters: [{ type: 'text', text: code }] }];
if (process.env.META_OTP_COPY_BUTTON !== 'false') components.push({ type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: code }] });
const res = await fetch(`https://graph.facebook.com/${version}/${id}/messages`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'template', template: { name: process.env.META_OTP_TEMPLATE || 'event509_otp', language: { code: process.env.META_OTP_LANG || 'fr' }, components } }),
});
const body = await res.json().catch(() => ({}));
console.log(res.status, JSON.stringify(body.error ? { error: { code: body.error.code, type: body.error.type, message: body.error.message } } : body));
if (res.ok) console.log(`Envoyé. Le code d'essai est ${code} (vérifiez que le message arrive bien sur WhatsApp).`);
process.exit(res.ok ? 0 : 2);
