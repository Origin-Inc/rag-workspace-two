import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Create test user
  const hashedPassword = await bcrypt.hash('password123', 10);
  
  const user = await prisma.user.upsert({
    where: { email: 'test@example.com' },
    update: {},
    create: {
      email: 'test@example.com',
      passwordHash: hashedPassword,
      name: 'Test User',
      emailVerified: true,
    },
  });

  console.log('✅ Created test user:', user.email);

  // Create workspace
  const workspace = await prisma.workspace.upsert({
    where: { slug: 'test-workspace' },
    update: {},
    create: {
      name: 'Test Workspace',
      slug: 'test-workspace',
      description: 'A test workspace for development',
    },
  });

  console.log('✅ Created workspace:', workspace.name);

  // Create roles
  const ownerRole = await prisma.role.upsert({
    where: { name: 'owner' },
    update: {},
    create: {
      name: 'owner',
      displayName: 'Owner',
      description: 'Full access to workspace',
    },
  });

  const memberRole = await prisma.role.upsert({
    where: { name: 'member' },
    update: {},
    create: {
      name: 'member',
      displayName: 'Member',
      description: 'Standard member access',
    },
  });

  console.log('✅ Created roles');

  // Add user to workspace as owner
  await prisma.userWorkspace.upsert({
    where: {
      userId_workspaceId: {
        userId: user.id,
        workspaceId: workspace.id,
      },
    },
    update: {},
    create: {
      userId: user.id,
      workspaceId: workspace.id,
      roleId: ownerRole.id,
    },
  });

  console.log('✅ Added user to workspace as owner');

  // Create sample projects
  const project1 = await prisma.project.create({
    data: {
      name: 'Documentation',
      slug: 'documentation',
      description: 'Main documentation project',
      workspaceId: workspace.id,
    },
  });

  const project2 = await prisma.project.create({
    data: {
      name: 'API Development',
      slug: 'api-development',
      description: 'Backend API development',
      workspaceId: workspace.id,
    },
  });

  console.log('✅ Created sample projects');

  // Create sample pages - now with workspaceId for new hierarchy structure
  await prisma.page.createMany({
    data: [
      {
        title: 'Getting Started',
        slug: 'getting-started',
        content: '# Getting Started\n\nWelcome to our documentation!',
        projectId: project1.id,
        workspaceId: workspace.id, // Added required workspaceId
        isPublic: true,
      },
      {
        title: 'API Reference',
        slug: 'api-reference',
        content: '# API Reference\n\nAPI endpoints documentation.',
        projectId: project2.id,
        workspaceId: workspace.id, // Added required workspaceId
        isPublic: true,
      },
      {
        title: 'Architecture Overview',
        slug: 'architecture-overview',
        content: '# Architecture\n\nSystem architecture overview.',
        projectId: project1.id,
        workspaceId: workspace.id, // Added required workspaceId
        isPublic: true,
      },
    ],
  });

  console.log('✅ Created sample pages');

  console.log('\n🎉 Seed completed successfully!');
  console.log('\n📧 Login credentials:');
  console.log('   Email: test@example.com');
  console.log('   Password: password123');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });