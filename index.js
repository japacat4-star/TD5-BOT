import { 
  Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, 
  ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, 
  Events, SlashCommandBuilder, REST, Routes 
} from "discord.js";
import fs from "fs";
import express from "express";
import dotenv from "dotenv";

dotenv.config();

// ---------- CLIENT ----------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

// ---------- WEB SERVER ----------
const app = express();
app.all("/", (req, res) => res.send("Bot MLC online ✅"));
app.listen(process.env.PORT || 3000, () => console.log("🌐 Servidor web ativo"));

// ---------- CONFIG ----------
const CHANNELS = {
  PAINEL: "⚫┃𝗥𝗲𝗹𝗮𝘁𝗼́𝗿𝗶𝗼",
  RELATORIO: "⚫┃recrutamento",
  FUNCOES: "⚜️┃𝗙𝘂𝗻𝗰̧𝗼̃𝗲𝘀",
  ACOES: "⚫┃ações",
  INATIVOS: "💢┃inativos"
};

const PONTOS_FILE = "./pontos.json";
let pontos = fs.existsSync(PONTOS_FILE) ? JSON.parse(fs.readFileSync(PONTOS_FILE, "utf-8")) : {};
function savePoints() { fs.writeFileSync(PONTOS_FILE, JSON.stringify(pontos, null, 2)); }

// ---------- AÇÕES ATIVAS ----------
const acoesAtivas = {}; // { messageId: { participantes: [] } }

// ---------- AUXILIARES ----------
async function postarPainel(guild) {
  try {
    const canal = guild.channels.cache.find(c => c.name.toLowerCase() === CHANNELS.PAINEL.toLowerCase());
    if (!canal) return console.log("⚠️ Canal de painel não encontrado.");

    const msgs = await canal.messages.fetch({ limit: 100 });
    for (const msg of msgs.values()) await msg.delete().catch(() => {});

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("abrir_recrutamento").setLabel("📋 Enviar Recrutamento").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("criar_acao").setLabel("📌 Criar Ação").setStyle(ButtonStyle.Primary)
    );

    const embed = new EmbedBuilder()
      .setTitle("📋 Painel MLC")
      .setDescription("Clique nos botões para enviar recrutamento ou criar uma ação.")
      .setColor("Yellow");

    await canal.send({ embeds: [embed], components: [row] });
    console.log("✅ Painel postado com sucesso.");
  } catch (err) {
    console.error("❌ Erro ao postar painel:", err);
  }
}

function atualizarUltimaInteracao(userId) {
  const hoje = new Date().toISOString();
  let inativos = fs.existsSync('./inativos.json') ? JSON.parse(fs.readFileSync('./inativos.json')) : {};
  inativos[userId] = hoje;
  fs.writeFileSync('./inativos.json', JSON.stringify(inativos, null, 2));
}

async function verificarInativos() {
  const inativos = fs.existsSync('./inativos.json') ? JSON.parse(fs.readFileSync('./inativos.json')) : {};
  const guild = client.guilds.cache.first();
  if (!guild) return;

  const canalInativos = guild.channels.cache.find(c => c.name.toLowerCase().includes("inativos"));
  if (!canalInativos) return console.log("⚠️ Canal de inativos não encontrado.");

  const agora = new Date();
  const limiteDias = 14;

  for (const [userId, ultima] of Object.entries(inativos)) {
    const ultimaData = new Date(ultima);
    const diffDias = (agora - ultimaData) / (1000 * 60 * 60 * 24);

    if (diffDias >= limiteDias) {
      const membro = guild.members.cache.get(userId);
      if (!membro) continue;

      await canalInativos.send(`⚠️ <@${userId}> está inativo(a) há ${Math.floor(diffDias)} dias.`);

      if (membro.kickable) {
        await membro.kick("Inatividade > 14 dias").catch(console.error);
      }

      delete inativos[userId];
    }
  }

  fs.writeFileSync('./inativos.json', JSON.stringify(inativos, null, 2));
}

setInterval(verificarInativos, 1000 * 60 * 60 * 24);

// ---------- MODAIS ----------
async function handleRecrutamentoModal(interaction) {
  try {
    atualizarUltimaInteracao(interaction.user.id);

    const nome = interaction.fields.getTextInputValue("nome");
    const idjogador = interaction.fields.getTextInputValue("idjogador");
    const idrecrutador = interaction.fields.getTextInputValue("idrecrutador");
    const whats = interaction.fields.getTextInputValue("whats") || "Não informado";

    const guild = interaction.guild;
    const canalRelatorio = guild.channels.cache.find(c => c.name.toLowerCase() === CHANNELS.RELATORIO.toLowerCase());
    if (!canalRelatorio) return interaction.reply({ content: "❌ Canal de recrutamento não encontrado.", flags: 64 });

    const embed = new EmbedBuilder()
      .setTitle("📋 Novo Recrutamento")
      .setColor("Green")
      .addFields(
        { name: "👤 Nome", value: nome, inline: true },
        { name: "🆔 ID do Jogador", value: `<@${idjogador}>`, inline: true },
        { name: "🧭 ID do Recrutador", value: idrecrutador, inline: true },
        { name: "📱 WhatsApp", value: whats, inline: true }
      )
      .setFooter({ text: `Enviado por ${interaction.user.tag}` })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`rec_aceitar|${idjogador}`).setLabel("✅ Aprovar").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`rec_recusar|${idjogador}`).setLabel("❌ Recusar").setStyle(ButtonStyle.Danger)
    );

    await canalRelatorio.send({ embeds: [embed], components: [row] });
    await interaction.reply({ content: "✅ Recrutamento enviado com sucesso!", flags: 64 });
  } catch (err) {
    console.error(err);
    await interaction.reply({ content: "❌ Erro ao processar recrutamento.", flags: 64 });
  }
}

async function handleAcaoModal(interaction) {
  try {
    atualizarUltimaInteracao(interaction.user.id);

    const acao = interaction.fields.getTextInputValue("acao");
    const horario = interaction.fields.getTextInputValue("horario");

    const guild = interaction.guild;
    const canalRegistros = guild.channels.cache.find(c => c.name.toLowerCase() === "📕┃registros".toLowerCase());
    if (!canalRegistros) return interaction.reply({ content: "❌ Canal de registros não encontrado.", flags: 64 });

    const embed = new EmbedBuilder()
      .setTitle(`📌 Ação: ${acao}`)
      .setColor("Blue")
      .addFields(
        { name: "🕒 Horário", value: horario, inline: true },
        { name: "👥 Participantes", value: "Nenhum participante ainda", inline: false }
      )
      .setFooter({ text: `Criada por ${interaction.user.tag}` })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("acao_entrar").setLabel("✅ Entrar").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("acao_sair").setLabel("❌ Sair").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId("acao_fechar").setLabel("🔒 Fechar").setStyle(ButtonStyle.Secondary)
    );

    const msg = await canalRegistros.send({ embeds: [embed], components: [row] });
    acoesAtivas[msg.id] = { participantes: [] };

    await interaction.reply({ content: "✅ Ação criada com sucesso!", flags: 64 });
  } catch (err) {
    console.error(err);
    await interaction.reply({ content: "❌ Erro ao criar ação.", flags: 64 });
  }
}

// ---------- BOTÕES ----------
async function handleRecrutamentoButton(interaction) {
  try {
    const [acao, idjogador] = interaction.customId.split("|");
    const aprovado = acao === "rec_aceitar";

    const embed = EmbedBuilder.from(interaction.message.embeds[0])
      .setColor(aprovado ? "Green" : "Red")
      .addFields({ name: "📋 Status", value: aprovado ? "✅ Aprovado" : "❌ Recusado" });

    await interaction.message.edit({ embeds: [embed], components: [] });
    if (!interaction.replied && !interaction.deferred) await interaction.deferUpdate();

    await interaction.followUp({
      content: aprovado ? `✅ Recrutamento de <@${idjogador}> aprovado!` : `❌ Recrutamento de <@${idjogador}> recusado.`,
      flags: 64
    });
  } catch (err) {
    console.error(err);
  }
}

async function handleAcaoButton(interaction) {
  const msgId = interaction.message.id;
  const dados = acoesAtivas[msgId];

  // Verifica se a ação ainda existe
  if (!dados || !Array.isArray(dados.participantes)) {
    return interaction.reply({ content: "❌ Ação não encontrada ou já fechada.", flags: 64 });
  }

  const memberId = interaction.user.id;

  // Gerencia entrada, saída e fechamento
  if (interaction.customId === "acao_entrar") {
    if (!dados.participantes.includes(memberId)) dados.participantes.push(memberId);
  } else if (interaction.customId === "acao_sair") {
    dados.participantes = dados.participantes.filter(id => id !== memberId);
  } else if (interaction.customId === "acao_fechar") {
    if (!interaction.member.roles.cache.some(r => r.name === "Superior")) {
      return interaction.reply({ content: "❌ Apenas Superior pode fechar a ação.", flags: 64 });
    }
    await interaction.message.edit({ components: [] });
    delete acoesAtivas[msgId];
    return interaction.reply({ content: "🔒 Ação fechada com sucesso!", flags: 64 });
  }

  const embed = EmbedBuilder.from(interaction.message.embeds[0]);

// Garantir que embed.fields seja um array
if (!embed.fields) embed.fields = [];

// Atualizar o campo de participantes com menções
const participantesMentions = dados.participantes.length > 0
  ? dados.participantes.map(id => `<@${id}>`).join("\n")
  : "Nenhum participante ainda";

const existeCampo = embed.fields.find(f => f.name === "👥 Participantes");
if (existeCampo) {
  // Atualiza o campo existente
  existeCampo.value = participantesMentions;
} else {
  // Cria o campo se não existir
  embed.addFields({ name: "👥 Participantes", value: participantesMentions, inline: false });
}

await interaction.message.edit({ embeds: [embed] });

// Atualiza sem enviar mensagem redundante
await interaction.deferUpdate();

}


// ---------- INTERAÇÕES ----------
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isButton()) return handleButton(interaction);
    if (interaction.isModalSubmit()) return handleModal(interaction);
    if (interaction.isChatInputCommand()) return handleSlash(interaction);
  } catch (err) { console.error(err); }
});

async function handleButton(interaction) {
  atualizarUltimaInteracao(interaction.user.id);
  const member = interaction.member;
  if (!member) return interaction.reply({ content: "❌ Membro não encontrado.", flags: 64 });

  const id = interaction.customId;

  if (id === "abrir_recrutamento") {
    const modal = new ModalBuilder()
      .setCustomId("modal_recrutamento")
      .setTitle("📋 Formulário de Recrutamento")
      .addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("nome").setLabel("Seu Nome").setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("idjogador").setLabel("Seu ID").setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("idrecrutador").setLabel("ID do Recrutador").setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("whats").setLabel("WhatsApp (Opcional)").setStyle(TextInputStyle.Short))
      );
    return interaction.showModal(modal);
  }

  if (id === "criar_acao") {
    if (!member.roles.cache.some(r => r.name === "Superior"))
      return interaction.reply({ content: "❌ Apenas Superior pode criar ações.", flags: 64 });

    const modal = new ModalBuilder()
      .setCustomId("modal_acao")
      .setTitle("📌 Criar Ação")
      .addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("acao").setLabel("Qual Ação?").setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("horario").setLabel("Horário de início").setStyle(TextInputStyle.Short).setRequired(true))
      );
    return interaction.showModal(modal);
  }

  if (id.startsWith("rec_")) return handleRecrutamentoButton(interaction);
  if (id.startsWith("acao_")) return handleAcaoButton(interaction);
}

async function handleModal(interaction) {
  atualizarUltimaInteracao(interaction.user.id);
  if (interaction.customId === "modal_recrutamento") return handleRecrutamentoModal(interaction);
  if (interaction.customId === "modal_acao") return handleAcaoModal(interaction);
}

// ---------- READY ----------
client.once(Events.ClientReady, async () => {
  console.log(`✅ Logado como ${client.user.tag}`);
  const guild = client.guilds.cache.first();
  if (!guild) return console.log("⚠️ Bot não está em guilds na cache.");
  await postarPainel(guild);
});

// ---------- SLASH COMMANDS ----------
async function handleSlash(interaction) {
  const { commandName } = interaction;
  if (commandName === "ranking") {
    const sorted = Object.entries(pontos).sort((a,b) => b[1]-a[1]);
    const desc = sorted.map(([id, pts], i) => `${i+1}. <@${id}> — ${pts} ponto(s)`).join("\n") || "Nenhum ponto registrado.";
    await interaction.reply({ content: desc, flags: 64 });
  }
  if (commandName === "resetpontos") {
    pontos = {};
    savePoints();
    await interaction.reply({ content: "✅ Pontos resetados!", flags: 64 });
  }
}

// ---------- REGISTRO DE SLASH ----------
const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);
(async () => {
  try {
    const commands = [
      new SlashCommandBuilder().setName("ranking").setDescription("Mostra ranking de pontos"),
      new SlashCommandBuilder().setName("resetpontos").setDescription("Reseta todos os pontos")
    ].map(cmd => cmd.toJSON());
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
    console.log("✅ Comandos slash registrados");
  } catch (e) { console.error(e); }
})();

// ---------- LOGIN ----------
client.login(process.env.TOKEN).catch(e => console.error("❌ Login falhou:", e.message));
