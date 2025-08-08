const { createBot, createProvider, createFlow, addKeyword, EVENTS } = require('@bot-whatsapp/bot')

const QRPortalWeb = require('@bot-whatsapp/portal')
const BaileysProvider = require('@bot-whatsapp/provider/baileys')
const MockAdapter = require('@bot-whatsapp/database/mock')

// Flujo para solicitar taxi
const flowSolicitarTaxi = addKeyword(['taxi', 'TAXI', 'Taxi'])
    .addAnswer('🚕 ¡Perfecto! Vamos a solicitar tu taxi.')
    .addAnswer(
        [
            'Por favor, proporciona la siguiente información:',
            '',
            '📍 *Dirección de origen:*'
        ],
        { capture: true },
        async (ctx, { flowDynamic }) => {
            await flowDynamic([
                '✅ Origen registrado.',
                '',
                'Ahora, indica la *dirección de destino:*'
            ])
        }
    )
    .addAnswer(
        ['📍 Indica el destino:'],
        { capture: true },
        async (ctx, { flowDynamic }) => {
            await flowDynamic([
                '✅ ¡Taxi solicitado!',
                '',
                'Tu taxi está en camino.',
                'Tiempo estimado: 5-10 minutos',
                '',
                'Escribe *menu* para volver al menú principal'
            ])
        }
    )

// Flujo para enviar mensaje
const flowEnviarMensaje = addKeyword(['mensaje', 'msj'])
    .addAnswer(
        [
            '📱 Por favor, escribe el número de teléfono:',
            '(Incluye el código de país)',
            '',
            'Ejemplo: +593987654321'
        ],
        { capture: true },
        async (ctx, { flowDynamic, state }) => {
            const phoneNumber = ctx.body.trim()
            
            // Validar formato básico del número
            if (!phoneNumber.startsWith('+') || phoneNumber.length < 10) {
                await flowDynamic([
                    '❌ Formato de número incorrecto',
                    '',
                    'Debe incluir el código de país con +',
                    'Ejemplo: +593987654321',
                    '',
                    'Escribe *mensaje* para intentar de nuevo'
                ])
                return
            }
            
            // Limpiar el número y asegurarse que solo tenga números
            const cleanNumber = phoneNumber.replace(/\D/g, '')
            await state.update({ targetPhone: cleanNumber })
            
            await flowDynamic([
                '💬 Por favor, escribe el mensaje que quieres enviar:',
            ])
        }
    )
    .addAnswer(
        [
            'Se enviará cuando lo escribas'
        ],
        { capture: true },
        async (ctx, { flowDynamic, provider, state }) => {
            const message = ctx.body
            const targetPhone = state.get('targetPhone')
            
            if (!targetPhone) {
                await flowDynamic([
                    '❌ Error: No se encontró el número de teléfono',
                    'Escribe *mensaje* para intentar de nuevo'
                ])
                return
            }

            try {
                // Asegurarse que el número esté en formato correcto
                const formattedPhone = targetPhone.startsWith('593') ? targetPhone : '593' + targetPhone.substring(1)
                
                // Enviar el mensaje
                await provider.sendText(`${formattedPhone}@s.whatsapp.net`, message)
                
                await flowDynamic([
                    '✅ ¡Mensaje enviado exitosamente!',
                    '',
                    'Escribe *menu* para volver al menú principal'
                ])
            } catch (error) {
                console.error('Error al enviar mensaje:', error)
                await flowDynamic([
                    '❌ Error al enviar el mensaje',
                    'Por favor verifica que:',
                    '1. El número tenga WhatsApp activo',
                    '2. El formato del número sea correcto',
                    '',
                    'Escribe *mensaje* para intentar de nuevo'
                ])
            }
        }
    )

// Flujo para volver al menú
const flowMenu = addKeyword(['menu', 'menú', 'inicio', 'volver'])
    .addAnswer('🚕 ¡Hola! Bienvenido')
    .addAnswer(
        [
            '📋 *Menú de opciones:*',
            '',
            '🚕 Escribe *taxi* para solicitar un taxi',
            '📤 Escribe *mensaje* para enviar un mensaje',
            '',
            'Escribe la palabra de la opción que deseas'
        ]
    )

// Flujo principal - responde a cualquier mensaje inicial
const flowPrincipal = addKeyword(EVENTS.WELCOME)
    .addAnswer('🚕 ¡Hola! Bienvenido')
    .addAnswer(
        [
            '📋 *Menú de opciones:*',
            '',
            '🚕 Escribe *taxi* para solicitar un taxi',
            '📤 Escribe *mensaje* para enviar un mensaje',
            '',
            'Escribe la palabra de la opción que deseas'
        ]
    )

const main = async () => {
    const adapterDB = new MockAdapter()
    const adapterFlow = createFlow([
        flowPrincipal,
        flowSolicitarTaxi,
        flowEnviarMensaje,
        flowMenu
    ])
    const adapterProvider = createProvider(BaileysProvider)

    createBot({
        flow: adapterFlow,
        provider: adapterProvider,
        database: adapterDB,
    })

    QRPortalWeb()
}

main()