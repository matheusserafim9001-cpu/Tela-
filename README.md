# Serafim Transmissões

Aplicação web de compartilhamento de tela para jogos usando WebRTC e Socket.IO.

## Recursos
- Criar sala com código de 6 caracteres.
- Até 8 espectadores por sala.
- Captura de tela e áudio do sistema quando o navegador/OS oferecer suporte.
- WebRTC direto entre anfitrião e espectadores.
- Reconexão de sinalização, reinício de ICE e mensagens de diagnóstico.
- Endpoint `/health` para monitoramento no Render.

## Publicar no GitHub e Render

1. Crie um repositório no GitHub chamado `serafim-transmissoes`.
2. Envie todos os arquivos desta pasta para a raiz do repositório.
3. No Render, escolha **New + → Blueprint** e conecte o repositório.
4. O Render lerá `render.yaml` e criará o serviço.
5. Aguarde o deploy e abra a URL HTTPS gerada.

O serviço precisa permanecer como **Web Service** (não Static Site), pois o Socket.IO usa conexões persistentes.

## Configuração TURN (recomendado)

O projeto já inclui servidores públicos STUN para descobrir caminhos de rede. STUN sozinho não resolve todas as redes: CGNAT, redes corporativas e alguns roteadores podem impedir a conexão direta. Para maior compatibilidade, crie credenciais em um provedor TURN (por exemplo, Metered ou Twilio) e adicione no Render, em Environment:

- `TURN_URL`: endereço(s) TURN fornecido(s), separados por vírgula. Ex.: `turn:host:3478?transport=udp,turns:host:5349?transport=tcp`
- `TURN_USERNAME`: usuário/credencial de acesso
- `TURN_CREDENTIAL`: senha/credencial

Depois salve e faça redeploy. Não coloque credenciais TURN no GitHub.

**Importante:** o plano gratuito do Render pode suspender o serviço quando fica sem uso. A primeira abertura depois da suspensão pode demorar. O servidor de sinalização não transporta o vídeo; o vídeo trafega por WebRTC entre os participantes.

## Como usar

- Abra a URL HTTPS no Chrome ou Edge atualizado.
- Anfitrião: clique em **Transmitir**, permita o compartilhamento e escolha a tela/janela do jogo. Se quiser áudio do jogo, habilite a opção de compartilhar áudio na janela do navegador (quando disponível).
- Envie o código de 6 caracteres aos amigos.
- Espectadores: abram a mesma URL, cliquem em **Assistir** e digitem o código.

## Limitações e dicas contra tela preta

- O navegador exige HTTPS e uma ação explícita do usuário para iniciar `getDisplayMedia`.
- Alguns jogos em tela cheia exclusiva, overlays e conteúdo protegido podem não ser capturados. Prefira modo janela sem bordas ou janela do jogo.
- No Windows, Chrome/Edge são os navegadores recomendados. Atualize o driver de vídeo e teste compartilhar a tela inteira ou a janela do jogo.
- Se a imagem parar, o anfitrião deve encerrar e iniciar a captura novamente.
- Para salas maiores, use uma arquitetura SFU (ex.: LiveKit). Esta versão usa malha P2P: o anfitrião envia uma cópia para cada espectador, então a quantidade de espectadores e a internet de upload do anfitrião afetam a qualidade.
- Não existe garantia absoluta contra tela preta: isso também depende do jogo, navegador, driver, permissões e rede.

## Desenvolvimento local

```bash
npm install
npm start
```

Abra `http://localhost:3000`. A captura de tela normalmente requer HTTPS; `localhost` é tratado como contexto seguro pelos navegadores modernos.
