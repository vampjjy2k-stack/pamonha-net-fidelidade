// create-admin.js
// Utilitário de linha de comando para criar (ou promover) a primeira conta de admin.
// Por segurança, não existe rota HTTP pública para criar admins — só este script,
// que só pode ser rodado por quem tem acesso ao servidor/banco de dados.
//
// Uso:
//   node create-admin.js "21999999999" "senhaForte123" "Nome do Admin"
//
// - Se já existir um usuário com esse telefone, ele é promovido para role "admin"
//   (a senha informada é ignorada nesse caso).
// - Se não existir, um novo usuário admin é criado com a senha informada.

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');

async function main() {
  const [, , phoneArg, passwordArg, nameArg] = process.argv;

  if (!phoneArg) {
    console.error('Uso: node create-admin.js "<telefone>" "<senha>" "<nome completo>"');
    process.exit(1);
  }

  const phone = phoneArg.replace(/\D/g, '');

  if (!process.env.MONGODB_URI) {
    console.error('❌ Defina MONGODB_URI no arquivo .env antes de rodar este script.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Conectado ao MongoDB.');

  let user = await User.findOne({ phone });

  if (user) {
    user.role = 'admin';
    await user.save();
    console.log(`✅ Usuário "${user.fullName}" (${phone}) promovido para admin.`);
  } else {
    if (!passwordArg || passwordArg.length < 6) {
      console.error('❌ Para criar um novo admin, informe uma senha com pelo menos 6 caracteres.');
      process.exit(1);
    }
    const passwordHash = await bcrypt.hash(passwordArg, 10);
    user = await User.create({
      fullName: nameArg || 'Administrador',
      phone,
      password: passwordHash,
      role: 'admin',
    });
    console.log(`✅ Novo admin criado: "${user.fullName}" (${phone}).`);
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Erro ao criar/promover admin:', err.message);
  process.exit(1);
});
