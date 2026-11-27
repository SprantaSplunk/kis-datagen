// English build (KIS_LANG=en): every string literal, template chunk, regex and object key in the
// visualization sources goes through the dashboard dictionary, so values the visualizations compare
// against (status words, test names) match the English data.
import { readFileSync } from 'node:fs';
import { parse } from 'acorn';
import MagicString from 'magic-string';
import { tr } from '../dashboards/lib/i18n.mjs';

const SOURCE_KEYS = new Set(['ImportDeclaration', 'ExportAllDeclaration', 'ExportNamedDeclaration', 'ImportExpression']);

export function translateSource(src, file, changes = []) {
    const ast = parse(src, { ecmaVersion: 'latest', sourceType: 'module' });
    const out = new MagicString(src);
    const note = (node, from, to) => {
        changes.push({ file, line: src.slice(0, node.start).split('\n').length, from, to });
    };

    const visit = (node, parent) => {
        if (!node || typeof node.type !== 'string') return;
        if (node.type === 'Literal' && typeof node.value === 'string' && !SOURCE_KEYS.has(parent?.type)) {
            const en = tr(node.value);
            if (en !== node.value) {
                out.overwrite(node.start, node.end, JSON.stringify(en));
                note(node, node.value, en);
            }
        } else if (node.type === 'Literal' && node.regex) {
            const en = tr(node.regex.pattern);
            if (en !== node.regex.pattern) {
                out.overwrite(node.start, node.end, `/${en}/${node.regex.flags}`);
                note(node, `/${node.regex.pattern}/`, `/${en}/`);
            }
        } else if (node.type === 'TemplateElement') {
            const en = tr(node.value.cooked);
            if (en !== node.value.cooked) {
                out.overwrite(node.start, node.end, en.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${'));
                note(node, node.value.cooked, en);
            }
        } else if (node.type === 'Property' && !node.computed && !node.shorthand && node.key.type === 'Identifier') {
            const en = tr(node.key.name);
            if (en !== node.key.name) {
                out.overwrite(node.key.start, node.key.end, JSON.stringify(en));
                note(node.key, node.key.name, en);
            }
        } else if (node.type === 'MemberExpression' && !node.computed && node.property.type === 'Identifier') {
            if (tr(node.property.name) !== node.property.name) {
                throw new Error(`${file}: .${node.property.name} would need a translation - use a string key`);
            }
        }
        for (const [key, value] of Object.entries(node)) {
            if (key === 'parent' || !value || typeof value !== 'object') continue;
            if (Array.isArray(value)) value.forEach((child) => visit(child, node));
            else visit(value, node);
        }
    };
    visit(ast, null);
    return out.toString();
}

export function i18nPlugin(changes) {
    return {
        name: 'kis-i18n',
        setup(build) {
            build.onLoad({ filter: /[\\/](visualizations|shared)[\\/].*\.js$/ }, (args) => {
                if (args.path.includes('node_modules')) return undefined;
                return { contents: translateSource(readFileSync(args.path, 'utf8'), args.path, changes), loader: 'js' };
            });
        },
    };
}
