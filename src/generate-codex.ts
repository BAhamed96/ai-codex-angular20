#!/usr/bin/env tsx
/**
 * ai-codex-angular20 — Generate a compact Angular 20 + NestJS index for AI assistants.
 *
 * Scans your repo and produces compact reference files that give AI coding
 * assistants instant context about your app structure, saving exploration time
 * at the start of each conversation.
 *
 * Usage:
 *   npx ai-codex-angular20
 *   npx ai-codex-angular20 --output .claude/codex
 *   npx ai-codex-angular20 --frontend-root frontend apps/web client --backend-root backend apps/api server
 *   npx ai-codex-angular20 --include src/shared src/lib
 *   npx ai-codex-angular20 --exclude dist coverage
 *   npx ai-codex-angular20 --schema backend/prisma/schema.prisma
 *
 * Config file (codex.config.json):
 *   {
 *     "output": ".ai-codex",
 *     "frontendRoots": ["frontend", "apps/web", "client"],
 *     "backendRoots": ["backend", "apps/api", "server"],
 *     "include": ["src/shared", "src/lib"],
 *     "exclude": ["tests", "__mocks__"],
 *     "schema": "backend/prisma/schema.prisma"
 *   }
 */

import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';

// ---------------------------------------------------------------------------
// CLI Argument Parsing
// ---------------------------------------------------------------------------

interface Config {
  output: string;
  include: string[];
  exclude: string[];
  schema: string | null;
  frontendRoots: string[];
  backendRoots: string[];
}

interface ConfigFile extends Partial<Config> {
  frontendRoot?: string | string[];
  backendRoot?: string | string[];
}

const ROOT = process.cwd();
const TODAY = new Date().toISOString().slice(0, 10);

function normalizeRootCandidates(...values: Array<unknown>): string[] {
  const roots: string[] = [];

  for (const value of values) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) roots.push(trimmed);
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item !== 'string') continue;
        const trimmed = item.trim();
        if (trimmed) roots.push(trimmed);
      }
    }
  }

  return uniqueStrings(roots);
}

function parseArgs(): Config {
  const args = process.argv.slice(2);
  const config: Config = {
    output: '.ai-codex',
    include: [],
    exclude: [],
    schema: null,
    frontendRoots: [],
    backendRoots: [],
  };

  const configPath = path.join(ROOT, 'codex.config.json');
  if (fs.existsSync(configPath)) {
    try {
      const fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as ConfigFile;
      if (typeof fileConfig.output === 'string') config.output = fileConfig.output;
      if (Array.isArray(fileConfig.include)) config.include = fileConfig.include;
      if (Array.isArray(fileConfig.exclude)) config.exclude = fileConfig.exclude;
      if (typeof fileConfig.schema === 'string') config.schema = fileConfig.schema;
      config.frontendRoots = normalizeRootCandidates(fileConfig.frontendRoot, fileConfig.frontendRoots);
      config.backendRoots = normalizeRootCandidates(fileConfig.backendRoot, fileConfig.backendRoots);
    } catch {
      console.warn('Warning: could not parse codex.config.json, using defaults');
    }
  }

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--output':
      case '-o':
        if (i + 1 >= args.length) {
          console.error('Error: --output requires a value');
          process.exit(1);
        }
        config.output = args[++i];
        break;
      case '--include':
        while (i + 1 < args.length && !args[i + 1].startsWith('-')) {
          config.include.push(args[++i]);
        }
        break;
      case '--exclude':
        while (i + 1 < args.length && !args[i + 1].startsWith('-')) {
          config.exclude.push(args[++i]);
        }
        break;
      case '--schema':
        if (i + 1 >= args.length) {
          console.error('Error: --schema requires a value');
          process.exit(1);
        }
        config.schema = args[++i];
        break;
      case '--frontend-root':
        if (i + 1 >= args.length || args[i + 1].startsWith('-')) {
          console.error('Error: --frontend-root requires a value');
          process.exit(1);
        }
        while (i + 1 < args.length && !args[i + 1].startsWith('-')) {
          config.frontendRoots.push(args[++i]);
        }
        break;
      case '--backend-root':
        if (i + 1 >= args.length || args[i + 1].startsWith('-')) {
          console.error('Error: --backend-root requires a value');
          process.exit(1);
        }
        while (i + 1 < args.length && !args[i + 1].startsWith('-')) {
          config.backendRoots.push(args[++i]);
        }
        break;
      case '--version':
      case '-v':
        console.log('ai-codex-angular20 v1.0.1');
        process.exit(0);
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
    }
  }

  return config;
}

function printHelp(): void {
  console.log(`
ai-codex-angular20 — Generate a compact Angular 20 + NestJS index for AI assistants

Usage:
  npx ai-codex-angular20 [options]

Options:
  --output, -o <dir>          Output directory (default: .ai-codex)
  --frontend-root <dirs...>   Angular app root candidates (can be repeated)
  --backend-root <dirs...>    NestJS app root candidates (can be repeated)
  --include <dirs...>         Directories to scan for shared exports
  --exclude <dirs...>         Directories to skip
  --schema <path>             Path to Prisma schema file (auto-detected)
  --version, -v               Show version
  --help, -h                  Show this help

Config file:
  Place a codex.config.json in your project root to set defaults.
`);
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_SKIP_DIRS = new Set([
  'node_modules', '.next', '.git', '.worktrees', '__pycache__', '.turbo',
  'dist', 'build', '.cache', 'coverage', '.nyc_output', '.parcel-cache',
  '.ai-codex', '.claude', '.angular', '.nx', 'tmp', 'temp',
]);

const FRONTEND_ROOT_CANDIDATES = [
  '.', 'frontend', 'web', 'client', 'ui', 'apps/web', 'apps/frontend',
  'apps/client', 'packages/web', 'packages/frontend',
];

const BACKEND_ROOT_CANDIDATES = [
  '.', 'backend', 'server', 'api', 'apps/api', 'apps/backend',
  'packages/api', 'packages/backend',
];

const LIB_DIR_CANDIDATES = [
  'src/lib', 'src/utils', 'src/helpers', 'src/shared', 'src/common',
  'lib', 'utils', 'helpers', 'shared', 'common',
  'src/app/shared', 'src/app/core', 'src/app/utils', 'src/app/common',
  'src/modules/shared',
];

const NEST_HTTP_DECORATORS = new Map<string, string>([
  ['Get', 'GET'],
  ['Post', 'POST'],
  ['Put', 'PUT'],
  ['Patch', 'PATCH'],
  ['Delete', 'DELETE'],
  ['Head', 'HEAD'],
  ['Options', 'OPTIONS'],
  ['All', 'ALL'],
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function shouldSkipFile(name: string): boolean {
  return (
    name.includes('.backup.') ||
    name.includes('-backup-') ||
    name.endsWith('.d.ts') ||
    name.endsWith('.map') ||
    name.endsWith('.min.js') ||
    name.endsWith('.min.css') ||
    name.endsWith('.spec.ts') ||
    name.endsWith('.spec.tsx') ||
    name.endsWith('.test.ts') ||
    name.endsWith('.test.tsx') ||
    name.endsWith('.stories.ts') ||
    name.endsWith('.stories.tsx')
  );
}

function walk(dir: string, extFilter?: string[], skipDirs?: Set<string>): string[] {
  const skip = skipDirs || DEFAULT_SKIP_DIRS;
  const results: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (skip.has(entry.name)) continue;
    if (entry.isSymbolicLink()) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walk(full, extFilter, skip));
      continue;
    }
    if (!entry.isFile()) continue;
    if (shouldSkipFile(entry.name)) continue;
    if (extFilter && !extFilter.some((ext) => entry.name.endsWith(ext))) continue;
    results.push(full);
  }

  return results;
}

function findFilesNamed(base: string, names: Set<string>, skipDirs?: Set<string>): string[] {
  const skip = skipDirs || DEFAULT_SKIP_DIRS;
  const results: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(base, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (skip.has(entry.name)) continue;
    if (entry.isSymbolicLink()) continue;
    const full = path.join(base, entry.name);
    if (entry.isDirectory()) {
      results.push(...findFilesNamed(full, names, skip));
      continue;
    }
    if (entry.isFile() && names.has(entry.name)) {
      results.push(full);
    }
  }

  return results;
}

function readFileSafe(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return '';
  }
}

function readPackageJsonSafe(dir: string): Record<string, unknown> | null {
  const filePath = path.join(dir, 'package.json');
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function hasDependency(pkg: Record<string, unknown> | null, dependencyName: string): boolean {
  if (!pkg) return false;
  const dependencySets = [pkg.dependencies, pkg.devDependencies, pkg.peerDependencies];
  return dependencySets.some((deps) => {
    if (!deps || typeof deps !== 'object') return false;
    return dependencyName in deps;
  });
}

function dirExists(dirPath: string): boolean {
  try {
    return fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, '/');
}

function normalizeRelativePath(filePath: string): string {
  return normalizeSlashes(path.relative(ROOT, filePath));
}

function resolveProjectPath(input: string): string {
  return path.isAbsolute(input) ? input : path.resolve(ROOT, input);
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function truncate(value: string, max = 72): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 3) + '...';
}

function pad(value: string, len: number): string {
  return value.length >= len ? value : value + ' '.repeat(len - value.length);
}

function joinRoute(parent: string, child: string): string {
  const left = parent === '/' ? '' : parent.replace(/\/+$/g, '');
  const right = child.replace(/^\/+|\/+$/g, '');
  if (!left && !right) return '/';
  if (!right) return left || '/';
  if (!left) return '/' + right;
  return `${left}/${right}`;
}

function getRouteGroup(route: string): string {
  const segments = route.split('/').filter(Boolean);
  if (segments[0] === 'api' && segments[1]) return segments[1];
  return segments[0] || 'root';
}

function getFeatureGroup(baseDir: string, filePath: string, fallback: string): string {
  const relDir = normalizeSlashes(path.relative(baseDir, path.dirname(filePath)));
  const parts = relDir.split('/').filter(Boolean);
  if (parts.length === 0) return fallback;
  return parts.slice(0, 3).join('/');
}

function resolveModuleFile(sourceFilePath: string, moduleSpecifier: string): string | null {
  if (!moduleSpecifier.startsWith('.')) return null;
  const basePath = path.resolve(path.dirname(sourceFilePath), moduleSpecifier);
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}.js`,
    `${basePath}/index.ts`,
    `${basePath}/index.tsx`,
    `${basePath}/index.js`,
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

// ---------------------------------------------------------------------------
// Framework Detection
// ---------------------------------------------------------------------------

interface FrameworkInfo {
  name: string;
  frontendRoot: string | null;
  backendRoot: string | null;
  frontendAppDir: string | null;
  backendSrcDir: string | null;
  libDirs: string[];
  hasPrisma: boolean;
  prismaSchemaPath: string | null;
  apiPrefix: string;
  skipDirs: Set<string>;
}

function isAngularProject(projectRoot: string): boolean {
  if (!dirExists(projectRoot)) return false;
  if (fs.existsSync(path.join(projectRoot, 'angular.json'))) return true;
  const pkg = readPackageJsonSafe(projectRoot);
  if (hasDependency(pkg, '@angular/core')) return true;
  const mainTs = readFileSafe(path.join(projectRoot, 'src', 'main.ts'));
  return /bootstrapApplication|platformBrowserDynamic|@angular\//.test(mainTs);
}

function isNestProject(projectRoot: string): boolean {
  if (!dirExists(projectRoot)) return false;
  if (fs.existsSync(path.join(projectRoot, 'nest-cli.json'))) return true;
  const pkg = readPackageJsonSafe(projectRoot);
  if (hasDependency(pkg, '@nestjs/core')) return true;
  const mainTs = readFileSafe(path.join(projectRoot, 'src', 'main.ts'));
  return /NestFactory|@nestjs\//.test(mainTs);
}

function detectProjectRoot(
  explicitRoots: string[],
  detector: (projectRoot: string) => boolean,
  markerNames: string[],
  candidates: string[],
): string | null {
  const resolvedExplicitRoots = uniqueStrings(explicitRoots.map((root) => resolveProjectPath(root)))
    .filter((candidate) => dirExists(candidate));

  for (const candidate of resolvedExplicitRoots) {
    if (detector(candidate)) return candidate;
  }

  if (resolvedExplicitRoots.length > 0) {
    return resolvedExplicitRoots[0];
  }

  const directCandidates = uniqueStrings([
    ROOT,
    ...candidates.map((candidate) => path.resolve(ROOT, candidate)),
  ]).filter((candidate) => dirExists(candidate));

  for (const candidate of directCandidates) {
    if (detector(candidate)) return candidate;
  }

  const markerFiles = findFilesNamed(ROOT, new Set(markerNames));
  for (const markerFile of markerFiles) {
    const candidate = path.dirname(markerFile);
    if (detector(candidate)) return candidate;
  }

  let topLevelEntries: fs.Dirent[] = [];
  try {
    topLevelEntries = fs.readdirSync(ROOT, { withFileTypes: true });
  } catch {
    return null;
  }

  for (const entry of topLevelEntries) {
    if (!entry.isDirectory()) continue;
    if (DEFAULT_SKIP_DIRS.has(entry.name)) continue;
    const candidate = path.join(ROOT, entry.name);
    if (detector(candidate)) return candidate;
  }

  return null;
}

function detectPrismaSchema(config: Config, backendRoot: string | null): string | null {
  const candidates = config.schema
    ? [resolveProjectPath(config.schema)]
    : uniqueStrings([
        backendRoot ? path.join(backendRoot, 'prisma', 'schema.prisma') : '',
        backendRoot ? path.join(backendRoot, 'prisma', 'schema', 'schema.prisma') : '',
        backendRoot ? path.join(backendRoot, 'schema.prisma') : '',
        path.join(ROOT, 'prisma', 'schema.prisma'),
        path.join(ROOT, 'prisma', 'schema', 'schema.prisma'),
        path.join(ROOT, 'schema.prisma'),
      ]);

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function detectLibDirs(frontendRoot: string | null, backendRoot: string | null): string[] {
  const roots = [frontendRoot, backendRoot, ROOT].filter((value): value is string => Boolean(value));
  const results: string[] = [];

  for (const root of roots) {
    for (const candidate of LIB_DIR_CANDIDATES) {
      const fullPath = path.join(root, candidate);
      if (dirExists(fullPath) && !results.includes(fullPath)) {
        results.push(fullPath);
      }
    }
  }

  return results;
}

function detectNestApiPrefix(backendSrcDir: string | null): string {
  if (!backendSrcDir) return '';
  const mainTs = readFileSafe(path.join(backendSrcDir, 'main.ts'));
  const match = mainTs.match(/setGlobalPrefix\(\s*['"`]([^'"`]+)['"`]/);
  return match ? match[1].replace(/^\/+|\/+$/g, '') : '';
}

function detectFramework(config: Config): FrameworkInfo {
  const skipDirs = new Set(DEFAULT_SKIP_DIRS);
  const frontendRoot = detectProjectRoot(
    config.frontendRoots,
    isAngularProject,
    ['angular.json'],
    FRONTEND_ROOT_CANDIDATES,
  );
  const backendRoot = detectProjectRoot(
    config.backendRoots,
    isNestProject,
    ['nest-cli.json'],
    BACKEND_ROOT_CANDIDATES,
  );
  const frontendAppDir = frontendRoot && dirExists(path.join(frontendRoot, 'src', 'app'))
    ? path.join(frontendRoot, 'src', 'app')
    : null;
  const backendSrcDir = backendRoot && dirExists(path.join(backendRoot, 'src'))
    ? path.join(backendRoot, 'src')
    : null;
  const prismaSchemaPath = detectPrismaSchema(config, backendRoot);

  let name = 'generic';
  if (frontendRoot && backendRoot) name = 'angular+nest';
  else if (frontendRoot) name = 'angular';
  else if (backendRoot) name = 'nestjs';

  return {
    name,
    frontendRoot,
    backendRoot,
    frontendAppDir,
    backendSrcDir,
    libDirs: detectLibDirs(frontendRoot, backendRoot),
    hasPrisma: Boolean(prismaSchemaPath),
    prismaSchemaPath,
    apiPrefix: detectNestApiPrefix(backendSrcDir),
    skipDirs,
  };
}

// ---------------------------------------------------------------------------
// TypeScript AST Helpers
// ---------------------------------------------------------------------------

interface DecoratorInfo {
  name: string;
  call: ts.CallExpression | null;
  text: string;
}

function createSourceFile(filePath: string): ts.SourceFile | null {
  const content = readFileSafe(filePath);
  if (!content) return null;
  return ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function getExpressionName(expression: ts.Expression): string {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return expression.getText();
}

function listDecorators(node: ts.Node): DecoratorInfo[] {
  const decorators = ts.canHaveDecorators(node) ? ts.getDecorators(node) || [] : [];
  return decorators.map((decorator) => {
    if (ts.isCallExpression(decorator.expression)) {
      return {
        name: getExpressionName(decorator.expression.expression),
        call: decorator.expression,
        text: decorator.expression.getText(),
      };
    }
    return {
      name: getExpressionName(decorator.expression),
      call: null,
      text: decorator.expression.getText(),
    };
  });
}

function getDecorator(node: ts.Node, names: string | string[]): DecoratorInfo | undefined {
  const allowed = Array.isArray(names) ? names : [names];
  return listDecorators(node).find((decorator) => allowed.includes(decorator.name));
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  if (!ts.canHaveModifiers(node)) return false;
  const modifiers = ts.getModifiers(node);
  return Boolean(modifiers?.some((modifier: ts.Modifier) => modifier.kind === kind));
}

function getStringLiteralValue(expression: ts.Expression | undefined): string | null {
  if (!expression) return null;
  if (ts.isStringLiteralLike(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    return expression.text;
  }
  return null;
}

function getBooleanLiteralValue(expression: ts.Expression | undefined): boolean | null {
  if (!expression) return null;
  if (expression.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (expression.kind === ts.SyntaxKind.FalseKeyword) return false;
  return null;
}

function getObjectProperty(objectLiteral: ts.ObjectLiteralExpression, propertyName: string): ts.ObjectLiteralElementLike | undefined {
  return objectLiteral.properties.find((property) => {
    if (!property.name) return false;
    return property.name.getText().replace(/['"`]/g, '') === propertyName;
  });
}

function getObjectPropertyExpression(objectLiteral: ts.ObjectLiteralExpression, propertyName: string): ts.Expression | undefined {
  const property = getObjectProperty(objectLiteral, propertyName);
  if (!property) return undefined;
  if (ts.isPropertyAssignment(property)) return property.initializer;
  if (ts.isShorthandPropertyAssignment(property)) return property.name;
  return undefined;
}

function getPropertyName(name: ts.PropertyName | undefined): string {
  if (!name) return '';
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return name.getText();
}

function getClassMemberName(name: ts.PropertyName | undefined): string {
  return getPropertyName(name);
}

function getCallRootIdentifier(expression: ts.Expression): string {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return getCallRootIdentifier(expression.expression);
  return '';
}

function getExpressionSummary(expression: ts.Expression | undefined): string | null {
  if (!expression) return null;
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  if (ts.isStringLiteralLike(expression)) return expression.text;
  return truncate(expression.getText());
}

function getPublicMethodNames(classDeclaration: ts.ClassDeclaration): string[] {
  const methods: string[] = [];
  for (const member of classDeclaration.members) {
    if (!ts.isMethodDeclaration(member)) continue;
    if (hasModifier(member, ts.SyntaxKind.PrivateKeyword)) continue;
    if (hasModifier(member, ts.SyntaxKind.ProtectedKeyword)) continue;
    const name = getClassMemberName(member.name);
    if (!name || name === 'constructor' || name.startsWith('_')) continue;
    methods.push(name);
  }
  return uniqueStrings(methods);
}

function getDecoratorAlias(decorator: DecoratorInfo | undefined): string | null {
  if (!decorator?.call || decorator.call.arguments.length === 0) return null;
  const [firstArg] = decorator.call.arguments;
  const directValue = getStringLiteralValue(firstArg);
  if (directValue) return directValue;
  if (ts.isObjectLiteralExpression(firstArg)) {
    const aliasExpression = getObjectPropertyExpression(firstArg, 'alias');
    return getStringLiteralValue(aliasExpression);
  }
  return null;
}

function getImportExportNames(expression: ts.Expression | undefined): string[] {
  if (!expression) return [];
  if (ts.isArrayLiteralExpression(expression)) {
    return expression.elements
      .map((element) => getExpressionSummary(element as ts.Expression))
      .filter((value): value is string => Boolean(value));
  }
  if (ts.isObjectLiteralExpression(expression)) {
    const names: string[] = [];
    for (const property of expression.properties) {
      if (ts.isPropertyAssignment(property)) {
        names.push(getExpressionSummary(property.initializer) || getPropertyName(property.name));
      } else if (ts.isShorthandPropertyAssignment(property)) {
        names.push(property.name.text);
      }
    }
    return uniqueStrings(names.filter(Boolean));
  }
  const summary = getExpressionSummary(expression);
  return summary ? [summary] : [];
}

function describeLazyTarget(expression: ts.Expression | undefined): string | null {
  if (!expression) return null;
  const text = expression.getText().replace(/\s+/g, ' ').trim();
  const importMatch = text.match(/import\((['"`])(.+?)\1\)/);
  const thenMatch = text.match(/then\(\s*\w+\s*=>\s*\w+\.([A-Za-z0-9_]+)\s*\)/);
  if (importMatch) {
    return thenMatch ? `${importMatch[2]}#${thenMatch[1]}` : importMatch[2];
  }
  return truncate(text);
}

// ---------------------------------------------------------------------------
// 1. routes.md -- NestJS API Routes
// ---------------------------------------------------------------------------

interface NestRouteInfo {
  route: string;
  methods: string[];
  tags: string[];
}

function getControllerPath(controllerDecorator: DecoratorInfo | undefined): string {
  if (!controllerDecorator?.call) return '';
  const [firstArg] = controllerDecorator.call.arguments;
  if (!firstArg) return '';
  const literal = getStringLiteralValue(firstArg);
  if (literal !== null) return literal;
  if (ts.isObjectLiteralExpression(firstArg)) {
    return getStringLiteralValue(getObjectPropertyExpression(firstArg, 'path')) || '';
  }
  return '';
}

function detectNestTags(sourceText: string): string[] {
  const tags: string[] = [];
  if (/UseGuards|AuthGuard|JwtAuthGuard|RolesGuard|PermissionsGuard|requireRole|CurrentUser/i.test(sourceText)) tags.push('auth');
  if (/CacheInterceptor|CacheTTL|cacheManager|redis/i.test(sourceText)) tags.push('cache');
  if (/PrismaService|@InjectRepository|Repository<|EntityManager|Sequelize|Mongoose|database|db\./i.test(sourceText)) tags.push('db');
  return tags;
}

function generateRoutes(framework: FrameworkInfo): string | null {
  if (!framework.backendSrcDir) return null;

  let controllerFiles = walk(framework.backendSrcDir, ['.ts'], framework.skipDirs)
    .filter((filePath) => filePath.endsWith('.controller.ts'));
  if (controllerFiles.length === 0) {
    controllerFiles = walk(framework.backendSrcDir, ['.ts'], framework.skipDirs);
  }

  const routeMap = new Map<string, NestRouteInfo>();

  for (const filePath of controllerFiles) {
    const sourceFile = createSourceFile(filePath);
    if (!sourceFile) continue;
    const fileText = sourceFile.getFullText();

    const visit = (node: ts.Node): void => {
      if (ts.isClassDeclaration(node)) {
        const controllerDecorator = getDecorator(node, 'Controller');
        if (controllerDecorator) {
          const controllerPath = getControllerPath(controllerDecorator);
          const classTags = detectNestTags(node.getText(sourceFile) + '\n' + fileText);

          for (const member of node.members) {
            if (!ts.isMethodDeclaration(member)) continue;
            if (hasModifier(member, ts.SyntaxKind.PrivateKeyword)) continue;
            if (hasModifier(member, ts.SyntaxKind.ProtectedKeyword)) continue;

            const httpDecorator = listDecorators(member)
              .find((decorator) => NEST_HTTP_DECORATORS.has(decorator.name));
            if (!httpDecorator) continue;

            const methodPath = httpDecorator.call
              ? getStringLiteralValue(httpDecorator.call.arguments[0]) || ''
              : '';
            const route = joinRoute(
              framework.apiPrefix ? `/${framework.apiPrefix}` : '/',
              joinRoute(controllerPath ? `/${controllerPath}` : '/', methodPath),
            );
            const methodTags = detectNestTags(member.getText(sourceFile));
            const tags = uniqueStrings([...classTags, ...methodTags]);
            const httpMethod = NEST_HTTP_DECORATORS.get(httpDecorator.name) || httpDecorator.name.toUpperCase();
            const existing = routeMap.get(route);

            if (existing) {
              existing.methods = uniqueStrings([...existing.methods, httpMethod]);
              existing.tags = uniqueStrings([...existing.tags, ...tags]);
            } else {
              routeMap.set(route, {
                route,
                methods: [httpMethod],
                tags,
              });
            }
          }
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  const routes = [...routeMap.values()].sort((a, b) => a.route.localeCompare(b.route));
  if (routes.length === 0) return null;

  const groups = new Map<string, NestRouteInfo[]>();
  for (const route of routes) {
    const group = getRouteGroup(route.route);
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)?.push(route);
  }

  const lines: string[] = [
    `# API Routes (generated ${TODAY})`,
    `# ${routes.length} routes total. [auth,cache,db]=high-signal tags.`,
    '',
  ];

  for (const [group, items] of groups) {
    lines.push(`## ${group}`);
    for (const route of items) {
      const tagStr = route.tags.length ? ` [${route.tags.join(',')}]` : '';
      lines.push(`${pad(route.methods.join(','), 12)} ${route.route}${tagStr}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// 2. pages.md -- Angular Route Tree
// ---------------------------------------------------------------------------

interface AngularRouteNode {
  path: string;
  component: string | null;
  loadComponent: string | null;
  loadChildren: string | null;
  redirectTo: string | null;
  guards: string[];
  resolvers: string[];
  title: string | null;
  pathMatch: string | null;
  children: AngularRouteNode[];
}

interface ImportBinding {
  importedName: string;
  filePath: string;
}

interface RouteFileContext {
  filePath: string;
  sourceFile: ts.SourceFile;
  arraysByName: Map<string, ts.ArrayLiteralExpression>;
  importsByLocalName: Map<string, ImportBinding>;
  rootExpressions: ts.Expression[];
}

interface AngularRouteSet {
  sourceLabel: string;
  routes: AngularRouteNode[];
}

interface FlatAngularRoute {
  route: string;
  target: string;
  tags: string[];
}

function looksLikeRouteArray(arrayLiteral: ts.ArrayLiteralExpression): boolean {
  return arrayLiteral.elements.every((element) => (
    ts.isObjectLiteralExpression(element) ||
    ts.isIdentifier(element) ||
    ts.isSpreadElement(element)
  ));
}

function isRoutesTypeNode(typeNode: ts.TypeNode | undefined): boolean {
  if (!typeNode) return false;
  const typeText = typeNode.getText().replace(/\s+/g, '');
  return typeText === 'Routes' || typeText === 'Route[]' || typeText.endsWith('Routes');
}

function buildAngularRouteRegistry(appDir: string, skipDirs: Set<string>): Map<string, RouteFileContext> {
  const routeFiles = walk(appDir, ['.ts'], skipDirs)
    .filter((filePath) => filePath.endsWith('.routes.ts') || path.basename(filePath) === 'app.config.ts');
  const registry = new Map<string, RouteFileContext>();

  for (const filePath of routeFiles) {
    const sourceFile = createSourceFile(filePath);
    if (!sourceFile) continue;

    const arraysByName = new Map<string, ts.ArrayLiteralExpression>();
    const importsByLocalName = new Map<string, ImportBinding>();
    const rootExpressions: ts.Expression[] = [];
    const fileName = path.basename(filePath);

    const visit = (node: ts.Node): void => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteralLike(node.moduleSpecifier)) {
        const resolvedModule = resolveModuleFile(filePath, node.moduleSpecifier.text);
        if (resolvedModule && node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) {
          for (const element of node.importClause.namedBindings.elements) {
            const localName = element.name.text;
            const importedName = element.propertyName?.text || element.name.text;
            importsByLocalName.set(localName, { importedName, filePath: resolvedModule });
          }
        }
      }

      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && ts.isArrayLiteralExpression(node.initializer)) {
        const shouldKeep = isRoutesTypeNode(node.type) || /routes?$/i.test(node.name.text) || fileName.endsWith('.routes.ts');
        if (shouldKeep && looksLikeRouteArray(node.initializer)) {
          arraysByName.set(node.name.text, node.initializer);
          if (isRoutesTypeNode(node.type) || fileName === 'app.routes.ts' || /^routes$/i.test(node.name.text)) {
            rootExpressions.push(node.name);
          }
        }
      }

      if (ts.isCallExpression(node) && getExpressionName(node.expression) === 'provideRouter' && node.arguments[0]) {
        rootExpressions.push(node.arguments[0]);
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);

    registry.set(filePath, {
      filePath,
      sourceFile,
      arraysByName,
      importsByLocalName,
      rootExpressions,
    });
  }

  return registry;
}

function resolveRouteArray(
  expression: ts.Expression | undefined,
  context: RouteFileContext,
  registry: Map<string, RouteFileContext>,
): ts.ArrayLiteralExpression | null {
  if (!expression) return null;
  if (ts.isArrayLiteralExpression(expression)) return expression;
  if (!ts.isIdentifier(expression)) return null;

  const local = context.arraysByName.get(expression.text);
  if (local) return local;

  const imported = context.importsByLocalName.get(expression.text);
  if (!imported) return null;

  const importedContext = registry.get(imported.filePath);
  if (!importedContext) return null;

  return importedContext.arraysByName.get(imported.importedName) || null;
}

function parseAngularRouteObject(
  objectLiteral: ts.ObjectLiteralExpression,
  context: RouteFileContext,
  registry: Map<string, RouteFileContext>,
  seenArrays: Set<string>,
): AngularRouteNode {
  const pathValue = getStringLiteralValue(getObjectPropertyExpression(objectLiteral, 'path')) || '';
  const component = getExpressionSummary(getObjectPropertyExpression(objectLiteral, 'component'));
  const loadComponent = describeLazyTarget(getObjectPropertyExpression(objectLiteral, 'loadComponent'));
  const loadChildren = describeLazyTarget(getObjectPropertyExpression(objectLiteral, 'loadChildren'));
  const redirectTo = getStringLiteralValue(getObjectPropertyExpression(objectLiteral, 'redirectTo'));
  const titleExpression = getObjectPropertyExpression(objectLiteral, 'title');
  const pathMatch = getStringLiteralValue(getObjectPropertyExpression(objectLiteral, 'pathMatch'));
  const guards = uniqueStrings([
    ...getImportExportNames(getObjectPropertyExpression(objectLiteral, 'canActivate')),
    ...getImportExportNames(getObjectPropertyExpression(objectLiteral, 'canActivateChild')),
    ...getImportExportNames(getObjectPropertyExpression(objectLiteral, 'canMatch')),
  ]);
  const resolvers = uniqueStrings(getImportExportNames(getObjectPropertyExpression(objectLiteral, 'resolve')));
  const childrenExpression = getObjectPropertyExpression(objectLiteral, 'children');
  const children = childrenExpression
    ? parseAngularRouteArray(childrenExpression, context, registry, seenArrays)
    : [];

  return {
    path: pathValue,
    component,
    loadComponent,
    loadChildren,
    redirectTo,
    guards,
    resolvers,
    title: getStringLiteralValue(titleExpression) || getExpressionSummary(titleExpression),
    pathMatch,
    children,
  };
}

function parseAngularRouteArray(
  expression: ts.Expression,
  context: RouteFileContext,
  registry: Map<string, RouteFileContext>,
  seenArrays: Set<string>,
): AngularRouteNode[] {
  const arrayLiteral = resolveRouteArray(expression, context, registry);
  if (!arrayLiteral) return [];

  const key = `${arrayLiteral.getSourceFile().fileName}:${arrayLiteral.pos}:${arrayLiteral.end}`;
  if (seenArrays.has(key)) return [];
  seenArrays.add(key);

  const routes: AngularRouteNode[] = [];
  for (const element of arrayLiteral.elements) {
    if (ts.isObjectLiteralExpression(element)) {
      routes.push(parseAngularRouteObject(element, context, registry, seenArrays));
      continue;
    }
    if (ts.isIdentifier(element)) {
      routes.push(...parseAngularRouteArray(element, context, registry, seenArrays));
      continue;
    }
    if (ts.isSpreadElement(element) && ts.isIdentifier(element.expression)) {
      routes.push(...parseAngularRouteArray(element.expression, context, registry, seenArrays));
    }
  }

  return routes;
}

function flattenAngularRoutes(routes: AngularRouteNode[], parentPath = '/'): FlatAngularRoute[] {
  const flat: FlatAngularRoute[] = [];

  for (const route of routes) {
    const fullPath = joinRoute(parentPath, route.path);
    const tags: string[] = [];
    if (route.loadChildren || route.loadComponent) tags.push('lazy');
    if (route.guards.length) tags.push(`guard:${route.guards.join('|')}`);
    if (route.resolvers.length) tags.push(`resolve:${route.resolvers.join('|')}`);
    if (route.title) tags.push(`title:${route.title}`);
    if (route.redirectTo) tags.push(`redirect:${route.redirectTo}`);
    if (route.pathMatch && route.redirectTo) tags.push(`match:${route.pathMatch}`);

    const target = route.redirectTo
      ? `redirect -> ${route.redirectTo}`
      : route.component
        ? route.component
        : route.loadComponent
          ? `loadComponent ${route.loadComponent}`
          : route.loadChildren
            ? `loadChildren ${route.loadChildren}`
            : route.children.length > 0
              ? '(group)'
              : '(route)';

    const shouldRender = Boolean(
      route.component ||
      route.loadComponent ||
      route.loadChildren ||
      route.redirectTo ||
      route.guards.length > 0 ||
      route.resolvers.length > 0 ||
      route.title ||
      route.path === '**',
    );

    if (shouldRender) {
      flat.push({ route: fullPath, target, tags });
    }
    flat.push(...flattenAngularRoutes(route.children, fullPath));
  }

  return flat;
}

function extractAngularRouteSets(frontendAppDir: string, skipDirs: Set<string>): AngularRouteSet[] {
  const registry = buildAngularRouteRegistry(frontendAppDir, skipDirs);
  if (registry.size === 0) return [];

  const appConfigPath = path.join(frontendAppDir, 'app.config.ts');
  const appRoutesPath = path.join(frontendAppDir, 'app.routes.ts');
  const preferredContexts = [registry.get(appConfigPath), registry.get(appRoutesPath)]
    .filter((context): context is RouteFileContext => Boolean(context));

  const parseContextRoots = (context: RouteFileContext): AngularRouteSet[] => {
    const results: AngularRouteSet[] = [];
    for (const rootExpression of context.rootExpressions) {
      const routes = parseAngularRouteArray(rootExpression, context, registry, new Set<string>());
      if (routes.length > 0) {
        results.push({
          sourceLabel: normalizeSlashes(path.relative(frontendAppDir, context.filePath)),
          routes,
        });
      }
    }
    return results;
  };

  for (const context of preferredContexts) {
    const parsed = parseContextRoots(context);
    if (parsed.length > 0) return parsed;
  }

  const fallbackSets: AngularRouteSet[] = [];
  for (const context of registry.values()) {
    fallbackSets.push(...parseContextRoots(context));
  }
  return fallbackSets;
}

function generatePages(framework: FrameworkInfo): string | null {
  if (!framework.frontendAppDir) return null;

  const routeSets = extractAngularRouteSets(framework.frontendAppDir, framework.skipDirs);
  if (routeSets.length === 0) return null;

  const renderedSets = routeSets
    .map((routeSet) => ({ sourceLabel: routeSet.sourceLabel, lines: flattenAngularRoutes(routeSet.routes) }))
    .filter((routeSet) => routeSet.lines.length > 0);
  if (renderedSets.length === 0) return null;

  const totalRoutes = renderedSets.reduce((count, routeSet) => count + routeSet.lines.length, 0);
  const output: string[] = [
    `# Angular Routes (generated ${TODAY})`,
    `# ${totalRoutes} routes. [lazy]=lazy-loaded, guard:/resolve:=route metadata.`,
    '',
  ];

  const showSections = renderedSets.length > 1;
  for (const routeSet of renderedSets) {
    if (showSections) {
      output.push(`## ${routeSet.sourceLabel}`);
    }
    for (const route of routeSet.lines) {
      const tagStr = route.tags.length ? ` [${route.tags.join(',')}]` : '';
      output.push(`${pad(route.route, 56)} ${route.target}${tagStr}`);
    }
    output.push('');
  }

  return output.join('\n');
}

// ---------------------------------------------------------------------------
// 3. lib.md -- Shared Library Exports
// ---------------------------------------------------------------------------

function shouldSkipLibFile(filePath: string, content: string): boolean {
  const normalized = normalizeSlashes(filePath);
  if (/\.(component|service|controller|module|routes)\.[jt]sx?$/.test(normalized)) return true;
  if (/@(Component|Injectable|Controller|Directive|Pipe|NgModule)\b/.test(content)) return true;
  return false;
}

function generateLib(framework: FrameworkInfo, config: Config): string | null {
  let scanDirs = framework.libDirs;

  if (config.include.length > 0) {
    scanDirs = config.include.map((dirPath) => resolveProjectPath(dirPath));
  }

  if (scanDirs.length === 0) {
    scanDirs = [path.join(ROOT, 'src'), path.join(ROOT, 'lib')].filter((dirPath) => dirExists(dirPath));
  }

  if (scanDirs.length === 0) return null;

  interface LibExport {
    kind: string;
    name: string;
  }

  interface LibFile {
    relPath: string;
    exports: LibExport[];
  }

  const filesWithExports: LibFile[] = [];

  for (const scanDir of scanDirs) {
    if (!dirExists(scanDir)) continue;
    const files = walk(scanDir, ['.ts', '.tsx', '.js', '.jsx'], framework.skipDirs);

    for (const filePath of files) {
      const content = readFileSafe(filePath);
      if (!content || shouldSkipLibFile(filePath, content)) continue;

      const exports: LibExport[] = [];
      for (const line of content.split('\n')) {
        const fnMatch = line.match(/^export\s+(?:async\s+)?function\s+(\w+)\s*(\([^)]*\))?/);
        if (fnMatch) {
          exports.push({ kind: 'fn', name: fnMatch[1] });
          continue;
        }

        const arrowMatch = line.match(/^export\s+const\s+(\w+)\s*=\s*(?:async\s+)?\(([^)]*)\)\s*(?::\s*\w+)?\s*=>/);
        if (arrowMatch) {
          exports.push({ kind: 'fn', name: arrowMatch[1] });
          continue;
        }

        const classMatch = line.match(/^export\s+class\s+(\w+)/);
        if (classMatch) {
          exports.push({ kind: 'class', name: classMatch[1] });
          continue;
        }

        const typeMatch = line.match(/^export\s+(?:interface|type)\s+(\w+)/);
        if (typeMatch) {
          exports.push({ kind: 'type', name: typeMatch[1] });
          continue;
        }

        const constMatch = line.match(/^export\s+const\s+(\w+)\s*(?::\s*([\w<>\[\]|&, ]+?))?\s*=/);
        if (constMatch && !arrowMatch) {
          exports.push({ kind: 'const', name: constMatch[1] });
        }
      }

      const meaningful = exports.filter((entry) => entry.kind === 'fn' || entry.kind === 'class');
      if (meaningful.length === 0) continue;

      filesWithExports.push({
        relPath: normalizeRelativePath(filePath),
        exports: meaningful,
      });
    }
  }

  if (filesWithExports.length === 0) return null;
  filesWithExports.sort((a, b) => a.relPath.localeCompare(b.relPath));

  const groups = new Map<string, LibFile[]>();
  for (const file of filesWithExports) {
    const group = normalizeSlashes(path.dirname(file.relPath));
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)?.push(file);
  }

  const output: string[] = [
    `# Shared Exports (generated ${TODAY})`,
    `# fn=function, class=class. Angular/Nest framework files omitted.`,
    '',
  ];

  for (const [group, files] of groups) {
    output.push(`## ${group}`);
    for (const file of files) {
      output.push(path.basename(file.relPath));
      const shown = file.exports.slice(0, 5);
      for (const entry of shown) {
        output.push(`  ${entry.kind} ${entry.name}`);
      }
      if (file.exports.length > shown.length) {
        output.push(`  +${file.exports.length - shown.length} more`);
      }
    }
    output.push('');
  }

  return output.join('\n');
}

// ---------------------------------------------------------------------------
// 4. schema.md -- Database Schema (Prisma)
// ---------------------------------------------------------------------------

function generateSchema(framework: FrameworkInfo): string | null {
  if (!framework.hasPrisma || !framework.prismaSchemaPath) return null;

  const content = readFileSafe(framework.prismaSchemaPath);
  if (!content) return null;

  const SKIP_AUDIT_FIELDS = new Set([
    'createdAt', 'updatedAt', 'deletedAt', 'isDeleted',
  ]);
  const PRISMA_SCALARS = new Set([
    'String', 'Int', 'Float', 'Boolean', 'DateTime', 'Json', 'BigInt', 'Decimal', 'Bytes',
  ]);

  interface ModelField {
    name: string;
    type: string;
    flags: string[];
    comment: string;
  }

  interface ModelRelation {
    fieldName: string;
    target: string;
    isArray: boolean;
  }

  interface ModelInfo {
    name: string;
    fields: ModelField[];
    relations: ModelRelation[];
  }

  const lines = content.split('\n');
  const models: ModelInfo[] = [];
  let currentModel: ModelInfo | null = null;
  let braceDepth = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    const modelStart = trimmed.match(/^model\s+(\w+)\s*\{/);
    if (modelStart) {
      currentModel = { name: modelStart[1], fields: [], relations: [] };
      braceDepth = 1;
      continue;
    }

    if (!currentModel) continue;

    for (const ch of trimmed) {
      if (ch === '{') braceDepth++;
      if (ch === '}') braceDepth--;
    }

    if (braceDepth <= 0) {
      models.push(currentModel);
      currentModel = null;
      continue;
    }

    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('@@')) continue;

    const fieldMatch = trimmed.match(/^(\w+)\s+([\w\[\]?]+)/);
    if (!fieldMatch) continue;

    const fieldName = fieldMatch[1];
    const fieldType = fieldMatch[2];
    const isRelation = /\@relation\(/.test(trimmed);
    const isArray = fieldType.endsWith('[]');
    const baseType = fieldType.replace('[]', '').replace('?', '');

    if (isRelation || (isArray && /^[A-Z]/.test(baseType))) {
      currentModel.relations.push({ fieldName, target: baseType, isArray });
      continue;
    }

    const isPK = /@id\b/.test(trimmed);
    const isUnique = /@unique\b/.test(trimmed);
    const isEnum = /^[A-Z]/.test(baseType) && !PRISMA_SCALARS.has(baseType);

    if (SKIP_AUDIT_FIELDS.has(fieldName) && !isPK && !isUnique) continue;

    const isKey = isPK || isUnique || isEnum;
    const isFKLike = /Id$|_id$/i.test(fieldName) && fieldName !== 'id';
    if (!isKey && !isFKLike) continue;

    const flags: string[] = [];
    if (isPK) flags.push('PK');
    if (isUnique) flags.push('UQ');

    const commentMatch = trimmed.match(/\/\/\s*(.+)/);
    const comment = commentMatch ? commentMatch[1].trim() : '';
    currentModel.fields.push({
      name: fieldName,
      type: fieldType.replace('?', ''),
      flags,
      comment,
    });
  }

  const output: string[] = [
    `# Database Schema (generated ${TODAY})`,
    `# ${models.length} models. PK=primary key, UQ=unique. Only key/FK/enum fields shown.`,
    '',
  ];

  for (const model of models) {
    if (/_backup_|_temp_|_old$|_bak$/i.test(model.name)) continue;

    if (model.fields.length <= 4 && model.relations.length <= 3) {
      const fieldParts = model.fields.map((field) => {
        const flagStr = field.flags.length ? `(${field.flags.join(',')})` : '';
        return `${field.name}${flagStr}`;
      });
      const relationParts = model.relations.map((relation) => `${relation.target}${relation.isArray ? '[]' : ''}`);
      const relationStr = relationParts.length ? ` -> ${relationParts.join(', ')}` : '';
      output.push(`**${model.name}** ${fieldParts.join(' | ')}${relationStr}`);
      continue;
    }

    output.push(`## ${model.name}`);
    for (const field of model.fields) {
      const flagStr = field.flags.length ? `  ${field.flags.join(',')}` : '';
      const commentStr = field.comment ? `  -- ${field.comment}` : '';
      output.push(`  ${pad(field.name, 22)} ${pad(field.type, 10)}${flagStr}${commentStr}`);
    }
    if (model.relations.length > 0) {
      const relationTargets = uniqueStrings(model.relations.map((relation) => `${relation.target}${relation.isArray ? '[]' : ''}`));
      output.push(`  -> ${relationTargets.join(', ')}`);
    }
    output.push('');
  }

  return output.join('\n');
}

// ---------------------------------------------------------------------------
// 5. components.md -- Angular Component Index
// ---------------------------------------------------------------------------

interface AngularComponentInfo {
  group: string;
  name: string;
  selector: string | null;
  standalone: boolean;
  inputs: string[];
  outputs: string[];
}

function collectComponentIO(classDeclaration: ts.ClassDeclaration): { inputs: string[]; outputs: string[] } {
  const inputs: string[] = [];
  const outputs: string[] = [];

  for (const member of classDeclaration.members) {
    const isPropertyLike = ts.isPropertyDeclaration(member) || ts.isGetAccessorDeclaration(member) || ts.isSetAccessorDeclaration(member);
    if (!isPropertyLike) continue;

    const name = getClassMemberName(member.name);
    if (!name) continue;

    const inputDecorator = getDecorator(member, 'Input');
    if (inputDecorator) {
      inputs.push(getDecoratorAlias(inputDecorator) || name);
    }

    const outputDecorator = getDecorator(member, 'Output');
    if (outputDecorator) {
      outputs.push(getDecoratorAlias(outputDecorator) || name);
    }

    if (ts.isPropertyDeclaration(member) && member.initializer && ts.isCallExpression(member.initializer)) {
      const rootIdentifier = getCallRootIdentifier(member.initializer.expression);
      if (rootIdentifier === 'input') inputs.push(name);
      if (rootIdentifier === 'output') outputs.push(name);
    }
  }

  return {
    inputs: uniqueStrings(inputs).slice(0, 6),
    outputs: uniqueStrings(outputs).slice(0, 6),
  };
}

function generateComponents(framework: FrameworkInfo): string | null {
  if (!framework.frontendAppDir) return null;

  const componentFiles = walk(framework.frontendAppDir, ['.ts'], framework.skipDirs)
    .filter((filePath) => filePath.endsWith('.component.ts'));
  if (componentFiles.length === 0) return null;

  const components: AngularComponentInfo[] = [];

  for (const filePath of componentFiles) {
    const sourceFile = createSourceFile(filePath);
    if (!sourceFile) continue;

    const visit = (node: ts.Node): void => {
      if (ts.isClassDeclaration(node)) {
        const componentDecorator = getDecorator(node, 'Component');
        if (componentDecorator?.call && node.name) {
          const metadata = componentDecorator.call.arguments[0];
          let selector: string | null = null;
          let standalone = false;

          if (metadata && ts.isObjectLiteralExpression(metadata)) {
            selector = getStringLiteralValue(getObjectPropertyExpression(metadata, 'selector'));
            standalone = getBooleanLiteralValue(getObjectPropertyExpression(metadata, 'standalone')) || false;
          }

          const io = collectComponentIO(node);
          components.push({
            group: getFeatureGroup(framework.frontendAppDir!, filePath, 'components'),
            name: node.name.text,
            selector,
            standalone,
            inputs: io.inputs,
            outputs: io.outputs,
          });
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  if (components.length === 0) return null;
  components.sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name));

  const groups = new Map<string, AngularComponentInfo[]>();
  for (const component of components) {
    if (!groups.has(component.group)) groups.set(component.group, []);
    groups.get(component.group)?.push(component);
  }

  const output: string[] = [
    `# Components (generated ${TODAY})`,
    `# (s)=standalone. in=inputs, out=outputs.`,
    '',
  ];

  for (const [group, items] of groups) {
    output.push(`## ${group}`);
    for (const component of items) {
      const details: string[] = [];
      if (component.selector) details.push(`<${component.selector}>`);
      if (component.inputs.length) details.push(`in: ${component.inputs.join(', ')}`);
      if (component.outputs.length) details.push(`out: ${component.outputs.join(', ')}`);
      output.push(`${component.standalone ? '(s) ' : '    '}${component.name}${details.length ? `  ${details.join('  ')}` : ''}`);
    }
    output.push('');
  }

  return output.join('\n');
}

// ---------------------------------------------------------------------------
// 6. services.md -- Angular/Nest Injectable Classes
// ---------------------------------------------------------------------------

interface ServiceInfo {
  group: string;
  kind: string;
  name: string;
  methods: string[];
}

function inferServiceKind(filePath: string): string {
  if (filePath.endsWith('.guard.ts')) return 'guard';
  if (filePath.endsWith('.interceptor.ts')) return 'interceptor';
  if (filePath.endsWith('.facade.ts')) return 'facade';
  if (filePath.endsWith('.store.ts')) return 'store';
  if (filePath.endsWith('.repository.ts')) return 'repo';
  if (filePath.endsWith('.service.ts')) return 'svc';
  return 'provider';
}

function collectInjectableServices(baseDir: string, scope: 'frontend' | 'backend', skipDirs: Set<string>): ServiceInfo[] {
  const files = walk(baseDir, ['.ts'], skipDirs)
    .filter((filePath) => !filePath.endsWith('.component.ts') && !filePath.endsWith('.module.ts') && !filePath.endsWith('.routes.ts'));
  const services: ServiceInfo[] = [];

  for (const filePath of files) {
    const sourceFile = createSourceFile(filePath);
    if (!sourceFile) continue;

    const visit = (node: ts.Node): void => {
      if (ts.isClassDeclaration(node) && node.name) {
        const injectableDecorator = getDecorator(node, 'Injectable');
        if (!injectableDecorator) {
          ts.forEachChild(node, visit);
          return;
        }
        if (getDecorator(node, ['Component', 'Directive', 'Pipe', 'NgModule', 'Controller'])) {
          ts.forEachChild(node, visit);
          return;
        }

        services.push({
          group: `${scope}/${getFeatureGroup(baseDir, filePath, scope)}`,
          kind: inferServiceKind(filePath),
          name: node.name.text,
          methods: getPublicMethodNames(node),
        });
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  return services;
}

function generateServices(framework: FrameworkInfo): string | null {
  const services: ServiceInfo[] = [];

  if (framework.frontendAppDir) {
    services.push(...collectInjectableServices(framework.frontendAppDir, 'frontend', framework.skipDirs));
  }
  if (framework.backendSrcDir) {
    services.push(...collectInjectableServices(framework.backendSrcDir, 'backend', framework.skipDirs));
  }

  if (services.length === 0) return null;
  services.sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name));

  const groups = new Map<string, ServiceInfo[]>();
  for (const service of services) {
    if (!groups.has(service.group)) groups.set(service.group, []);
    groups.get(service.group)?.push(service);
  }

  const output: string[] = [
    `# Services (generated ${TODAY})`,
    `# Angular/Nest injectable classes. First public methods shown.`,
    '',
  ];

  for (const [group, items] of groups) {
    output.push(`## ${group}`);
    for (const service of items) {
      const shownMethods = service.methods.slice(0, 6);
      const details = shownMethods.length ? `  ${shownMethods.join(', ')}` : '';
      const extra = service.methods.length > shownMethods.length ? `  +${service.methods.length - shownMethods.length} more` : '';
      output.push(`${service.kind} ${service.name}${details}${extra}`);
    }
    output.push('');
  }

  return output.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  console.log('\nai-codex-angular20 -- Angular 20 + NestJS indexer for AI assistants\n');

  const config = parseArgs();
  const framework = detectFramework(config);

  for (const dir of config.exclude) {
    framework.skipDirs.add(dir);
  }

  console.log(`  Framework:      ${framework.name}`);
  console.log(`  Output:         ${config.output}/`);
  if (framework.frontendRoot) console.log(`  Frontend root:  ${normalizeRelativePath(framework.frontendRoot)}`);
  if (framework.backendRoot) console.log(`  Backend root:   ${normalizeRelativePath(framework.backendRoot)}`);
  if (framework.apiPrefix) console.log(`  API prefix:     /${framework.apiPrefix}`);
  if (framework.hasPrisma) console.log(`  Prisma:         ${normalizeRelativePath(framework.prismaSchemaPath!)}`);
  console.log('');

  const outputDir = path.resolve(ROOT, config.output);
  try {
    fs.mkdirSync(outputDir, { recursive: true });
  } catch (error) {
    console.error(`Error: could not create output directory "${outputDir}": ${(error as Error).message}`);
    process.exit(1);
  }

  const generators: Array<[string, () => string | null]> = [
    ['routes.md', () => generateRoutes(framework)],
    ['pages.md', () => generatePages(framework)],
    ['services.md', () => generateServices(framework)],
    ['lib.md', () => generateLib(framework, config)],
    ['schema.md', () => generateSchema(framework)],
    ['components.md', () => generateComponents(framework)],
  ];

  let totalFiles = 0;
  let totalLines = 0;

  for (const [filename, generator] of generators) {
    const start = Date.now();
    let content: string | null;

    try {
      content = generator();
    } catch (error) {
      console.warn(`  ${pad(filename, 20)} ERROR: ${(error as Error).message}`);
      continue;
    }

    const elapsed = Date.now() - start;
    if (content === null) {
      console.log(`  ${pad(filename, 20)} skipped (not applicable)`);
      continue;
    }

    const lineCount = content.split('\n').length;
    totalFiles++;
    totalLines += lineCount;

    try {
      fs.writeFileSync(path.join(outputDir, filename), content, 'utf-8');
    } catch (error) {
      console.error(`  ${pad(filename, 20)} ERROR writing file: ${(error as Error).message}`);
      continue;
    }

    console.log(`  ${pad(filename, 20)} ${pad(`${lineCount} lines`, 14)} (${elapsed}ms)`);
  }

  console.log(`\n  Total: ${totalLines} lines across ${totalFiles} files`);
  console.log(`  Output: ${outputDir}/`);
  console.log('');
}

main();