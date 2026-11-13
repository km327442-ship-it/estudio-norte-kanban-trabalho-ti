# Meu quadro Kanban

Quadro Kanban colaborativo com Firebase Authentication, Cloud Firestore e deploy estatico no Netlify. Para executar localmente, use o VS Code com Live Server; Node.js nao e necessario para o app.

## 1. Criar um projeto Firebase

1. Acesse [Firebase Console](https://console.firebase.google.com/) e crie seu proprio projeto.
2. Adicione um app Web (`</>`) e registre-o.
3. Em **Authentication > Sign-in method**, habilite **E-mail/senha** e **E-mail link (passwordless sign-in)** para que convites sejam enviados por email.
4. Em **Firestore Database**, crie o banco na regiao adequada. A regiao nao pode ser alterada depois.
5. Em **Authentication > Settings > Authorized domains**, confirme `localhost`. Se abrir o Live Server em `127.0.0.1`, adicione esse dominio tambem, sem a porta.

## 2. Conectar o app

Abra `firebase-config.js` e substitua os valores de exemplo pelos valores de **Project settings > General > Your apps > SDK setup and configuration** do seu app Web. Mantenha todos os campos, inclusive `measurementId` quando o Console o fornecer. Esse ID e opcional para Authentication e Firestore; se nao existir no seu projeto, deixe seu valor como string vazia.

O SDK Firebase e carregado pelo CDN em `firebase.js`. O navegador precisa de conexao com a internet para acessar `www.gstatic.com`. Nao troque esses imports por imports npm.

## 3. Publicar as regras do Firestore

No Console, abra **Firestore Database > Rules**, substitua o conteúdo pela íntegra do arquivo `firestore.rules` e clique em **Publish**. Só membros podem ler o quadro; somente `owner`/`admin` e `editor` podem gravar tarefas, comentários, convites, notificações e atividade. O papel do leitor é aplicado pelo Firestore, não só pela interface.

Nao use regras publicas. O primeiro cadastro cria `boards/quadro-principal`; os membros ficam em `boards/quadro-principal/members/{uid}`.

## 4. Executar com Live Server

1. Abra no VS Code a pasta que contem `index.html`, `script.js`, `firebase.js` e `firebase-config.js`.
2. Instale a extensao **Live Server**, se necessario.
3. Clique com o botao direito em `index.html` e escolha **Open with Live Server**.
4. Antes de publicar o site, crie sua conta pelo Live Server. O primeiro usuário a inicializar o quadro vazio se torna proprietário. Não publique o quadro vazio antes desse passo.
5. Cadastre nome público, e-mail válido e senha com pelo menos seis caracteres.

Nao abra por `file:///`. O Live Server normalmente usa `http://localhost:5500`; esse dominio precisa estar autorizado no Firebase.

## Como os dados sao salvos

Contas e sessões são do Firebase Authentication. O quadro compartilhado fica em `boards/quadro-principal`; tarefas, comentários, membros, convites, notificações e atividade usam documentos e subcoleções do Firestore. `onSnapshot` mantém as telas atualizadas em tempo real. Uma conta sem convite não entra no quadro. Um leitor pode consultar, mas o Firestore rejeita suas tentativas de escrita mesmo se forem feitas fora da interface.

O proprietário abre **Membros**, informa o email e escolhe **Proprietário**, **Editor** ou **Leitor** antes de enviar o convite. O Firebase envia um link de autenticação; o papel só é aplicado depois que o destinatário abre o link e verifica o endereço. No mesmo dispositivo, o app usa o email salvo durante o envio; em outro dispositivo, o destinatário precisa confirmar o email. Para membros existentes, o proprietário pode mudar o papel no seletor. Os cards mostram responsável, avatar/iniciais, prioridade e data de entrega. Clique no título para abrir `/board/quadro-principal/task/{id}` em nova aba. Detalhes, comentários, menções e histórico continuam disponíveis após atualizar a página.

O convite usa o modelo email-link do Firebase Authentication. Personalize o assunto e o texto em **Authentication > Templates** se quiser mencionar o nome do quadro no email.

Os dados da versão antiga em `localStorage` não são migrados automaticamente. O `apiKey` do Firebase Web é uma configuração pública do cliente; a proteção dos dados depende de Authentication e das regras publicadas, nunca de esconder essa chave.

## Deploy no Netlify

O arquivo `netlify.toml` define o diretório publicado e reescreve `/board/*` para `index.html`, permitindo recarregar links de tarefas diretamente.

1. Faça o bootstrap da conta proprietária em local antes de publicar, conforme a seção anterior.
2. No Netlify, escolha **Add new site > Import an existing project** e conecte o repositório GitHub.
3. Use a raiz do projeto. `netlify.toml` configura a publicação estática; deixe o comando de build vazio.
4. Após o deploy, adicione o domínio `*.netlify.app` em **Firebase Authentication > Settings > Authorized domains**.
5. Teste com duas contas: envie um convite por email como editor/leitor, aceite o link e confira as regras, tarefas, comentários, menções e URLs diretas.

O deploy público exige acesso ao repositório e à conta Netlify; não foi executado a partir deste workspace.

## Publicar no Firebase Hosting (opcional)

O `firebase.json` ja configura Hosting para servir a raiz do projeto e exclui `.git`, `.qodo`, `data`, README e regras do pacote publico. `firebase deploy` publica o site e as regras do Firestore.

Instale a Firebase CLI, autentique-se e associe seu projeto:

```powershell
npm.cmd install --global firebase-tools
firebase.cmd login
firebase.cmd use --add
```

Selecione `trabalho-f0b93` no comando `firebase use --add`. Antes de publicar, confira que esse e o projeto escolhido:

```powershell
firebase.cmd use
firebase.cmd deploy
```

O deploy informa os enderecos `*.web.app` e `*.firebaseapp.com`. Em **Authentication > Settings > Authorized domains**, confirme que o dominio do Hosting esta autorizado. `.firebaserc` e ignorado pelo Git para nao compartilhar o projeto selecionado. Se `firebase init` perguntar sobre sobrescrever `firebase.json` ou `firestore.rules`, mantenha os arquivos existentes para preservar o Hosting e as regras restritas por UID.

## Se algo falhar

- **Login ou cadastro:** confirme que E-mail/senha esta habilitado, `firebase-config.js` corresponde ao projeto e o dominio local esta autorizado.
- **`permission-denied`:** confirme que as regras foram publicadas no banco do projeto indicado em `projectId`.
- **Erro de rede:** confirme a conexao e o acesso a `www.gstatic.com`; recarregue depois de corrigir a configuracao.

Em uma publicacao web, autorize tambem o dominio real no Firebase Authentication e publique as regras no projeto conectado. Crie o administrador antes de abrir o cadastro ao público. Nunca compartilhe senhas; a configuração Web é pública e deve ser protegida pelas regras.
