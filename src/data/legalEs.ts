/**
 * Textos jurídicos por defecto en español (traducción de los documentos franceses e ingleses).
 * Mismo formato que legalDefaults.ts: « # » título, « > » actualización, « ## » sección, « - » viñeta, si no, párrafo.
 * Los valores entre dobles llaves ({{email}}, {{commission}}…) provienen de los ajustes del administrador.
 * Nota: el texto original de referencia es el francés; esta versión es una traducción de cortesía.
 */
export const legalEs = {
  terms: `# Condiciones de uso
> Última actualización: 15 de noviembre de 2026

## 1. Presentación

Event509 es una plataforma en línea que permite a los organizadores crear y promocionar eventos, y a los participantes comprar boletos. El servicio es editado por JC Multimedia, con sede en {{address}}, Haití. Contacto: {{email}}.

Al crear una cuenta o usar Event509, aceptas estas condiciones. Si no estás de acuerdo, no uses la aplicación.

## 2. Papel de Event509

Event509 es un intermediario técnico. No somos el organizador de los eventos publicados en la plataforma. El contrato de venta del boleto se celebra directamente entre el organizador y el participante. Event509 proporciona la herramienta de publicación, venta, pago y control de acceso.

## 3. Cuenta de usuario
- La información que proporcionas debe ser exacta y estar actualizada.
- Eres responsable de la confidencialidad de tu contraseña y de toda la actividad realizada desde tu cuenta.
- Una cuenta es personal. No puede venderse ni cederse.

## 4. Para los participantes
- Los precios se muestran en gourdes (HTG) o en dólares estadounidenses (USD), según el evento. Los gastos de servicio de Event509 a cargo del comprador ({{feeBuyer}}) se añaden al precio y se indican antes del pago.
- El pedido se confirma solo tras recibir el pago. Entonces se envía un boleto electrónico (código QR) por la aplicación y por {{sendChannel}}.
- Cada boleto es válido una sola vez. Un boleto copiado, falsificado o ya utilizado será rechazado en la entrada.
- Debes respetar el reglamento del evento y las normas de seguridad del lugar. El organizador puede negar la entrada en caso de comportamiento peligroso o de incumplimiento de las reglas.
- La reventa de un boleto está permitida, siempre que el precio solicitado no supere el precio original en más de un {{resalePercent}} %. Por encima de este límite, Event509 puede anular los boletos afectados sin reembolso.
- Un evento privado no aparece en las listas del sitio: solo las personas que tienen su enlace pueden verlo y comprar un boleto. Los boletos de un evento privado no pueden revenderse.

## 5. Para los organizadores
- Debes proporcionar información veraz sobre tu evento: fecha, lugar, programa, precios, condiciones de acceso.
- Garantizas que tienes derecho a organizar este evento y que cuentas con todas las autorizaciones necesarias (lugar, autoridades, derechos de autor, etc.).
- Eres el único responsable del desarrollo del evento, de la seguridad de los participantes y del cumplimiento de las leyes vigentes.
- Tú fijas el plazo de reembolso de cada evento: hasta un número de días antes del evento ({{organizerRefundDays}} por defecto, 0 = sin reembolso). Se muestra en la página del evento antes de la compra.
- Si cancelas un evento, reembolsas a los compradores. Una vez solicitado o efectuado un pago para un evento, ya no puedes cancelarlo tú mismo: contacta con la administración de Event509.
- Los fondos de las ventas se te pagan evento por evento, a petición desde tu espacio de organizador: una vez terminado el plazo de reembolso del evento, y solo si se ha vendido al menos el 40 % de los boletos de pago o si el evento tiene lugar dentro de 5 días o menos, tras deducir la comisión de Event509: {{commission}} % en total, repartida entre el comprador ({{feeBuyer}}) y tú ({{feeOrganizer}}). Event509 puede retener un pago en caso de sospecha de fraude, de disputa o de cancelación del evento.
- Debes pagar tú mismo tus impuestos y tasas sobre tus ingresos.

## 6. Pagos

Los pagos se hacen con los medios que se muestran en la aplicación ({{payments}}). Los procesan proveedores externos. Event509 no conserva los datos completos de tu tarjeta bancaria.

## 7. Contenidos prohibidos

Está prohibido publicar un evento o un contenido:
- ilegal, fraudulento o engañoso;
- que incite al odio, a la violencia o a la discriminación;
- de carácter pornográfico o que explote a menores;
- que vulnere los derechos de terceros (propiedad intelectual, vida privada, imagen);
- que promueva actividades peligrosas o ilegales.

Event509 puede retirar cualquier evento o suspender cualquier cuenta que no respete estas reglas, sin previo aviso.

## 8. Propiedad intelectual

La aplicación, su nombre, su logotipo y su diseño pertenecen a JC Multimedia. Los organizadores conservan sus derechos sobre sus contenidos, pero conceden a Event509 el derecho de mostrarlos y promocionarlos en la plataforma.

## 9. Limitación de responsabilidad

Event509 no puede ser considerado responsable:
- de la cancelación, el aplazamiento o el mal desarrollo de un evento;
- de los daños, lesiones o pérdidas ocurridos durante un evento;
- de las interrupciones del servicio debidas a fallos de internet o de electricidad o a casos de fuerza mayor.

Dentro de los límites permitidos por la ley, nuestra responsabilidad se limita al importe pagado por el pedido en cuestión.

## 10. Suspensión y cierre de cuenta

Puedes cerrar tu cuenta en cualquier momento. Podemos suspender o eliminar una cuenta en caso de incumplimiento de estas condiciones o de fraude.

## 11. Modificación de las condiciones

Podemos modificar estas condiciones. Los cambios importantes se anunciarán en la aplicación. Seguir usando Event509 tras la modificación implica su aceptación.

## 12. Ley aplicable y disputas

Estas condiciones se rigen por las leyes de la República de Haití. Buscamos primero una solución amistosa. De no lograrla, la disputa se someterá a las autoridades competentes de Puerto Príncipe, en particular a la Fiscalía de Puerto Príncipe, o a cualquier otra autoridad competente.`,

  privacy: `# Política de privacidad
> Última actualización: 15 de noviembre de 2026

## 1. Quién es responsable de tus datos

JC Multimedia, editor de Event509, {{address}}. Contacto: {{email}}.

## 2. Datos que recopilamos
- Cuenta: apellido, nombre, correo, número de teléfono, contraseña (cifrada).
- Pedidos: eventos comprados, boletos, importes, medio de pago utilizado (sin los números completos de la tarjeta).
- Organizadores: información de la organización, datos de pago para los desembolsos, documento de identidad si es necesario para verificar la cuenta.
- Datos técnicos: tipo de dispositivo, sistema, dirección IP, registros de conexión, páginas consultadas.
- Ubicación: solo si lo autorizas. En la aplicación, la posición aproximada de tu teléfono (redondeada a unos 1 km) se detecta automáticamente para proponerte eventos y avisarte de los nuevos eventos cerca de ti. Puedes desactivarla en cualquier momento en los ajustes: entonces se borra.

## 3. Para qué los usamos
- Crear y gestionar tu cuenta.
- Procesar los pedidos, enviar los boletos y gestionar los reembolsos.
- Pagar los fondos a los organizadores.
- Controlar el acceso a los eventos (escaneo de boletos).
- Prevenir el fraude y proteger la plataforma.
- Enviarte mensajes sobre tus pedidos y, si estás de acuerdo, ofertas y novedades.
- Mejorar la aplicación.

## 4. Con quién los compartimos
- El organizador del evento que compraste: nombre, correo e información del boleto, para la gestión del evento.
- Los proveedores de pago y de servicios técnicos (alojamiento, envío de correos/SMS).
- Las autoridades, si la ley lo exige.

No vendemos tus datos personales.

## 5. Conservación

Conservamos tus datos mientras tu cuenta esté activa y después durante {{retention}} años tras su cierre para cumplir nuestras obligaciones legales y contables. Transcurrido ese tiempo, se eliminan o se anonimizan.

## 6. Seguridad

Utilizamos medidas razonables para proteger tus datos: conexión cifrada, contraseñas cifradas, acceso limitado. Ningún sistema es 100 % seguro, pero hacemos lo necesario para reducir los riesgos. Mantén tu contraseña en secreto.

## 7. Tus derechos

Puedes solicitar:
- acceder a tus datos;
- corregirlos;
- eliminarlos;
- retirar tu consentimiento para los mensajes promocionales (enlace de baja en cada mensaje).

Escríbenos a {{email}}. Respondemos en un plazo de {{replyDays}} días.

## 8. Cookies y herramientas de medición

La aplicación puede usar cookies y herramientas de medición para su buen funcionamiento y para entender cómo se utiliza. Puedes rechazarlas en los ajustes de tu dispositivo.

## 9. Modificaciones

Podemos actualizar esta política. Los cambios importantes se te señalarán en la aplicación.`,

  refund: `# Política de reembolso
> Última actualización: 15 de noviembre de 2026

## 1. Principio general

Los boletos comprados en Event509 no son reembolsables, salvo en los casos previstos a continuación. Cada organizador puede ofrecer una política más generosa, que se mostrará en la página de su evento antes de la compra.

## 2. Evento cancelado

Si el organizador cancela el evento, se te reembolsa íntegramente (precio del boleto + gastos de servicio). El reembolso se inicia automáticamente en un plazo de {{refundDelay}} días hábiles, por el medio de pago utilizado.

## 3. Evento aplazado o modificado
- Si el evento se aplaza, tu boleto sigue siendo válido para la nueva fecha.
- Si la nueva fecha no te conviene, puedes solicitar un reembolso en los {{postponeDays}} días siguientes al anuncio del aplazamiento.
- Si el lugar, el artista principal o el contenido cambian de forma importante, se aplica la misma regla.

## 4. Reembolso a petición del participante

Salvo indicación contraria del organizador, no hay reembolso si:
- cambias de opinión o ya no estás disponible;
- llegas tarde o no te presentas;
- se te niega la entrada por tu comportamiento o por incumplir el reglamento;
- tu boleto se ha perdido, compartido o copiado.

Cada evento indica, antes de la compra, su plazo de reembolso: puedes solicitar un reembolso hasta un cierto número de días antes del evento ({{organizerRefundDays}} días por defecto; el organizador puede elegir otro plazo o no aceptar ninguno). Pasado este plazo, no se acepta ninguna solicitud, salvo que el evento se cancele o haya un error de facturación (ver más abajo). En este caso no se reembolsan los gastos de servicio de Event509.

## 5. Errores y pagos duplicados

Si se te cobró dos veces, o se te facturó un importe incorrecto por un error técnico, contáctanos en las {{errorHours}} horas siguientes. Lo verificamos y te reembolsamos la suma cobrada de más.

## 6. Boleto fraudulento o no válido

Si un boleto comprado en Event509 es rechazado en la entrada y eres el primer comprador legítimo, escríbenos con tu comprobante de compra. Tras la verificación, te reembolsamos o resolvemos el problema con el organizador.

## 7. Cómo solicitar un reembolso
- Escribe a {{email}} o usa el botón «Ayuda» de la aplicación.
- Indica tu nombre, el número de pedido y el motivo de tu solicitud.
- Respondemos en un plazo de {{supportDays}} días hábiles.

## 8. Plazos y medio de reembolso

El reembolso se hace por el medio de pago original ({{payments}}). El plazo puede variar según tu operador o tu banco, tras nuestra validación.

## 9. Consecuencias para el organizador

Cuando un reembolso es debido por una cancelación o una falta del organizador, el importe se deduce de sus pagos. Si ya se le pagó, Event509 puede reclamarle la suma.`,
};
