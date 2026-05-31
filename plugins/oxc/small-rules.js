import { basename as e, dirname as t, extname as n, relative as r } from "@std/path";
import { parseSync as i } from "oxc-parser";
import { regex as a } from "arktype";
import { ResolverFactory as o } from "oxc-resolver";
function s(e) {
	return e;
}
function c(e) {
	return e;
}
function l(e, t) {
	return e.type === `TSArrayType` ?
		`Array<${l(e.elementType, t)}>` :
		e.type === `TSTypeOperator` && e.operator === `readonly` && e.typeAnnotation.type === `TSArrayType` ?
		`ReadonlyArray<${l(e.typeAnnotation.elementType, t)}>` :
		t.getText(e);
}
function u({ parent: e }) {
	return !(e.type === `TSRestType` && e.parent.type === `TSTupleType` || e.type === `TSTupleType` ||
		e.type === `TSArrayType` || e.type === `TSTypeOperator` && e.operator === `readonly`);
}
const d = c({
	create(e) {
		function t(t) {
			e.report({
				fix(n) {
					return n.replaceText(t, l(t, e.sourceCode));
				},
				messageId: `useGenericArrayType`,
				node: t,
			});
		}
		return {
			TSArrayType(e) {
				u(e) && t(e);
			},
			TSTypeOperator(e) {
				e.operator !== `readonly` || e.typeAnnotation.type !== `TSArrayType` || u(e) && t(e);
			},
		};
	},
	meta: {
		docs: { description: `Disallow bracket array type syntax and require Array<T> / ReadonlyArray<T>.` },
		fixable: `code`,
		messages: {
			useGenericArrayType:
				`Bracket array type syntax is not allowed. Use Array<T> or ReadonlyArray<T> generic syntax.`,
		},
		schema: [],
		type: `problem`,
	},
});
function f(e) {
	let t = e;
	for (;;) {
		switch (t.type) {
			case `ChainExpression`:
			case `ParenthesizedExpression`:
			case `TSAsExpression`:
			case `TSInstantiationExpression`:
			case `TSNonNullExpression`:
			case `TSSatisfiesExpression`:
			case `TSTypeAssertion`:
				t = t.expression;
				break;
			default:
				return t;
		}
	}
}
function p(e) {
	return e.computed ?
		e.property.type === `Literal` && typeof e.property.value == `string` ? e.property.value : void 0 :
		e.property.type === `Identifier` ?
		e.property.name :
		void 0;
}
function m(e, t, n) {
	let r = e.getScope(t);
	for (; r !== null;) {
		let e = r.set.get(n);
		if (e !== void 0 && e.defs.length > 0) return !0;
		r = r.upper;
	}
	return !1;
}
function h(e) {
	return typeof e == `object` && !!e && !Array.isArray(e);
}
function g(e) {
	return typeof e == `string` && e.length > 0;
}
function _(e) {
	if (!Array.isArray(e)) return !1;
	for (let t of e) if (typeof t != `string`) return !1;
	return !0;
}
function ee(e) {
	if (!h(e)) return !1;
	for (let t of Object.values(e)) if (typeof t != `string`) return !1;
	return !0;
}
const te = /^[A-Z]/v, ne = new Set([`end`, `loc`, `parent`, `range`, `start`, `type`]);
function v(e) {
	return h(e) && typeof e.type == `string`;
}
function re(e) {
	return ne.has(e);
}
function y(e) {
	return te.test(e);
}
function b(e) {
	return e.type === `VariableDeclarator`;
}
function ie(e) {
	return h(e) && `type` in e && e.type === `TSTypeAnnotation`;
}
function ae(e, t) {
	return e.type === `Identifier` && e.name === t;
}
function oe(e, t, n) {
	return e.callee.type === `Identifier` ?
		t.has(e.callee.name) :
		e.callee.type !== `MemberExpression` || e.callee.object.type !== `Identifier` ?
		!1 :
		n.has(e.callee.object.name) && p(e.callee) === `useMemo`;
}
function se({ imported: e }) {
	return e.type === `Identifier` ? e.name : e.value;
}
function x(e) {
	return e.type === `Identifier` && typeof e.name == `string`;
}
function S(e) {
	return e.type === `Identifier`;
}
function ce(e) {
	return e.type === `JSXIdentifier` && `name` in e;
}
function le(e) {
	return e.type === `JSXOpeningElement`;
}
function ue(e) {
	return e.type === `ImportDeclaration`;
}
function de(e) {
	return e.type === `Literal` && typeof e.value == `string`;
}
function fe(e) {
	return e.type === `CallExpression`;
}
function pe(e) {
	return e.type === `ImportSpecifier`;
}
function me(e) {
	return e.type === `ExportSpecifier`;
}
function C(e) {
	return e.type === `Property`;
}
function w(e) {
	return e.type === `MemberExpression`;
}
function he(e) {
	return e.type === `AssignmentExpression`;
}
function ge(e) {
	return e.type === `UnaryExpression`;
}
function _e(e) {
	return e.type === `BinaryExpression`;
}
function ve(e) {
	return e.type === `LogicalExpression`;
}
function ye(e) {
	return e.type === `ConditionalExpression`;
}
function be(e) {
	return e.type === `SequenceExpression`;
}
function xe(e) {
	return e.type === `ObjectExpression`;
}
function Se(e) {
	return e.type === `MethodDefinition` || e.type === `TSAbstractMethodDefinition`;
}
function Ce(e) {
	return e.type === `PropertyDefinition` || e.type === `TSAbstractPropertyDefinition`;
}
function we(e) {
	return e.type === `ImportDefaultSpecifier`;
}
function Te(e) {
	return e.type === `ImportNamespaceSpecifier`;
}
function Ee(e) {
	return e.type === `VariableDeclaration`;
}
function De(e) {
	return e.type === `ExportNamedDeclaration`;
}
function Oe(e) {
	return e.type === `FunctionDeclaration` || e.type === `FunctionExpression`;
}
function ke(e) {
	return e.type === `ClassDeclaration` || e.type === `ClassExpression`;
}
function Ae(e) {
	return e.type === `TSTypeAliasDeclaration`;
}
function T(e) {
	return e.type === `Literal`;
}
function je(e) {
	return e.type === `ArrowFunctionExpression`;
}
function Me(e) {
	return Oe(e) || je(e);
}
function Ne(e) {
	return e.type === `TSQualifiedName`;
}
function Pe(e) {
	return e.type === `Literal` && typeof e.value == `number`;
}
function Fe(e) {
	return e.type === `NewExpression`;
}
function Ie(e) {
	return e.type === `ArrayExpression`;
}
function Le(e) {
	return e.type === `ObjectExpression`;
}
function Re(e) {
	return e.type === `TemplateLiteral`;
}
function ze(e) {
	return e.type === `ExpressionStatement`;
}
function Be(e) {
	return e.type === `TSTypeAssertion`;
}
function Ve(e) {
	return e.type === `TSAsExpression`;
}
function He(e) {
	return e.type === `AssignmentPattern`;
}
function Ue(e) {
	return e.type === `ThisExpression`;
}
function We(e) {
	if (!fe(e) || e.optional) return !1;
	let { callee: t } = e;
	if (!S(t) || t.name !== `require` || e.arguments.length !== 1) return !1;
	let [n] = e.arguments;
	return n !== void 0 && de(n);
}
const Ge = new Set([`FC`, `FunctionComponent`, `VFC`, `VoidFunctionComponent`]);
function Ke(e) {
	if (e.type === `Identifier` && Ge.has(e.name)) return e.name;
	if (e.type === `TSQualifiedName` && Ge.has(e.right.name)) return e.right.name;
}
function qe(e) {
	if (!(`typeAnnotation` in e.id)) return;
	let { typeAnnotation: t } = e.id;
	return ie(t) ? t : void 0;
}
const Je = c({
		create(e) {
			return {
				VariableDeclarator(t) {
					let n = qe(t);
					if (n === void 0) return;
					let r = n.typeAnnotation;
					r.type !== `TSTypeReference` || Ke(r.typeName) === void 0 ||
						t.init?.type !== `ArrowFunctionExpression` || e.report({ messageId: `banReactFC`, node: t });
				},
			};
		},
		meta: {
			docs: {
				description:
					`Ban React.FC and similar component type annotations. Use explicit function declarations instead.`,
			},
			messages: {
				banReactFC:
					"Avoid React.FC/FunctionComponent/VFC/VoidFunctionComponent types. They break debug information and profiling. Use explicit function declarations instead: `function Component(props: Props) { ... }`",
			},
			schema: [],
			type: `problem`,
		},
	}),
	Ye = new Map([[`omit`, { originalName: `Omit`, replacementName: `Except` }]]);
function Xe(e) {
	let t = new Map(Ye);
	if (!h(e) || !(`bannedTypes` in e)) return t;
	let { bannedTypes: n } = e;
	if (n === void 0) return t;
	if (_(n)) {
		for (let e of n) t.set(e.toLowerCase(), { originalName: e, replacementName: void 0 });
		return t;
	}
	if (ee(n)) {
		for (let [e, r] of Object.entries(n)) {
			t.set(e.toLowerCase(), { originalName: e, replacementName: r });
		}
	}
	return t;
}
function Ze(e) {
	if (e.type === `Identifier`) return e.name;
	if (e.type === `TSQualifiedName`) return e.right.name;
}
const Qe = c({
	create(e) {
		let [t] = e.options, n = Xe(t);
		return n.size === 0 ? {} : {
			TSTypeReference(t) {
				let r = Ze(t.typeName);
				if (r === void 0) return;
				let i = n.get(r.toLowerCase());
				if (i !== void 0) {
					if (i.replacementName !== void 0 && i.replacementName !== ``) {
						e.report({
							data: { replacementName: i.replacementName, typeName: i.originalName },
							messageId: `bannedTypeWithReplacement`,
							node: t.typeName,
						});
						return;
					}
					e.report({ data: { typeName: i.originalName }, messageId: `bannedType`, node: t.typeName });
				}
			},
		};
	},
	meta: {
		docs: { description: `Ban configured TypeScript utility types, defaulting to Omit in favor of Except.` },
		messages: {
			bannedType:
				`Type '{{typeName}}' is banned by project configuration. Use the project-preferred alternative for this type.`,
			bannedTypeWithReplacement: `Type '{{typeName}}' is banned. Use '{{replacementName}}' instead.`,
		},
		schema: [{
			additionalProperties: !1,
			properties: {
				bannedTypes: {
					description:
						`Array of banned type names or an object mapping banned type names to preferred replacement names.`,
					oneOf: [{ items: { type: `string` }, type: `array` }, {
						additionalProperties: { type: `string` },
						type: `object`,
					}],
				},
			},
			type: `object`,
		}],
		type: `problem`,
	},
});
function $e(e) {
	return e === `roblox-ts` || e === `standard`;
}
const et = new Set([`react`, `react-dom`]), tt = new Set([`@rbxts/react`, `@rbxts/roact`]);
function E(e) {
	return e === `standard` ? et : tt;
}
function nt(e, t) {
	return t.has(e.source.value);
}
function rt(e) {
	return !h(e) || e.environment !== `roblox-ts` ? `standard` : `roblox-ts`;
}
const it = new Map([[`useEffect`, 1], [`useInsertionEffect`, 1], [`useLayoutEffect`, 1]]),
	at = new Set([`useCallback`, `useMemo`]),
	ot = new Set([`useBinding`, `useRef`]),
	st = new Set([`useReducer`, `useState`, `useTransition`]),
	ct = new Set([...ot, ...st]),
	lt = new Set([
		`ArrayExpression`,
		`ArrowFunctionExpression`,
		`ClassExpression`,
		`FunctionExpression`,
		`NewExpression`,
		`ObjectExpression`,
	]);
function ut(e) {
	return e === `aggressive` || e === `definite` || e === `moderate`;
}
function dt(e, t) {
	if (!e.computed && e.object.type === `Identifier` && t.has(e.object.name)) {
		return e.property.type === `Identifier` ? e.property.name : void 0;
	}
}
function ft(e) {
	let t = f(e);
	for (; t.type === `MemberExpression`;) t = f(t.object);
	return t.type === `Identifier` ? t : void 0;
}
function pt(e) {
	return lt.has(e.type);
}
function mt(e) {
	if (e !== null) {
		if (e.type === `Identifier`) return e.name;
		if (e.type === `AssignmentPattern` && e.left.type === `Identifier`) return e.left.name;
		if (e.type === `RestElement` && e.argument.type === `Identifier`) return e.argument.name;
	}
}
function ht(e, t, n) {
	let r = e.elements[n];
	return r == null ? !1 : mt(r) === t;
}
function gt(e) {
	return e.scope.type === `module` || e.scope.type === `global`;
}
const _t = c({
		create(e) {
			let [t] = e.options,
				n = h(t) ? t : {},
				r = `mode` in n && ut(n.mode) ? n.mode : `definite`,
				i = `environment` in n && $e(n.environment) ? n.environment : `roblox-ts`,
				a = new Map(it);
			if (`hooks` in n && Array.isArray(n.hooks)) {
				for (let e of n.hooks) {
					if (!h(e) || !(`name` in e) || typeof e.name != `string`) continue;
					let t = `dependenciesIndex` in e && typeof e.dependenciesIndex == `number` ?
						e.dependenciesIndex :
						1;
					a.set(e.name, t);
				}
			}
			let o = E(i),
				s = new Set(),
				c = new Map(),
				l = new Set(),
				u = new Map(),
				d = new WeakMap(),
				{ sourceCode: p } = e;
			function m(e) {
				let t = p.getScope(e);
				for (; t !== null;) {
					let n = t.set.get(e.name);
					if (n !== void 0) return n;
					t = t.upper;
				}
			}
			function g(e) {
				let { callee: t } = e;
				if (t.type === `Identifier`) return l.has(t.name);
				if (t.type === `MemberExpression`) {
					let e = dt(t, s);
					return e !== void 0 && at.has(e);
				}
				return !1;
			}
			function _(e) {
				let { callee: t } = e;
				if (t.type === `Identifier`) {
					let e = u.get(t.name);
					return e === void 0 ? void 0 : ot.has(e) ? `whole` : st.has(e) ? `index1` : void 0;
				}
				if (t.type === `MemberExpression`) {
					let e = dt(t, s);
					if (e === void 0) return;
					if (ot.has(e)) return `whole`;
					if (st.has(e)) return `index1`;
				}
			}
			function ee(e, t) {
				if (e.type === `Parameter`) return `unknown`;
				if (e.type === `ImportBinding`) return `memoized`;
				let { node: n } = e;
				if (n.type === `FunctionDeclaration` || n.type === `ClassDeclaration`) return `unmemoized`;
				if (n.type !== `VariableDeclarator`) return `unknown`;
				let i = n.parent;
				if (i.type === `VariableDeclaration` && i.kind !== `const`) {
					return r === `definite` ? `unknown` : `unmemoized`;
				}
				let a = n.init === null ? void 0 : f(n.init);
				if (a === void 0) return `unknown`;
				if (pt(a)) return `unmemoized`;
				if (a.type === `CallExpression`) {
					if (g(a)) return `memoized`;
					let e = _(a);
					return e === `whole` || e === `index1` && n.id.type === `ArrayPattern` && ht(n.id, t, 1) ?
						`memoized` :
						r === `definite` ?
						`unknown` :
						`unmemoized`;
				}
				return `unknown`;
			}
			function te(e) {
				let t = d.get(e);
				if (t !== void 0) return t;
				if (gt(e)) return d.set(e, `memoized`), `memoized`;
				let n = !1;
				for (let t of e.defs) {
					let r = ee(t, e.name);
					if (r === `unmemoized`) return d.set(e, `unmemoized`), `unmemoized`;
					r === `memoized` && (n = !0);
				}
				let i = n ? `memoized` : `unknown`;
				return r === `aggressive` && i !== `memoized` && (i = `unmemoized`), d.set(e, i), i;
			}
			function ne(e) {
				let t = f(e);
				if (pt(t)) return `unmemoized`;
				if (t.type === `CallExpression`) return r === `definite` ? `unknown` : `unmemoized`;
				let n = ft(t);
				if (n === void 0) return `unknown`;
				let i = m(n);
				return i === void 0 ? `unknown` : te(i);
			}
			function v(e) {
				let { callee: t } = e;
				if (t.type === `Identifier`) return c.get(t.name);
				if (t.type === `MemberExpression`) {
					let e = dt(t, s);
					return e === void 0 ? void 0 : a.get(e);
				}
			}
			return {
				CallExpression(t) {
					let n = v(t);
					if (n === void 0) return;
					let i = t.arguments[n];
					if (i?.type === `ArrayExpression`) {
						for (let t of i.elements) {
							if (t === null) continue;
							if (t.type === `SpreadElement`) {
								if (r === `definite`) continue;
								let n = t.argument, i = p.getText(n);
								e.report({ data: { name: i }, messageId: `unmemoizedDependency`, node: n });
								continue;
							}
							if (ne(t) !== `unmemoized`) continue;
							let n = p.getText(t);
							e.report({ data: { name: n }, messageId: `unmemoizedDependency`, node: t });
						}
					}
				},
				ImportDeclaration(e) {
					if (nt(e, o)) {
						for (let t of e.specifiers) {
							if (t.type === `ImportDefaultSpecifier` || t.type === `ImportNamespaceSpecifier`) {
								s.add(t.local.name);
								continue;
							}
							let e = se(t);
							if (e !== void 0) {
								if (a.has(e)) {
									let n = a.get(e);
									c.set(t.local.name, n ?? 1);
								}
								at.has(e) && l.add(t.local.name), ct.has(e) && u.set(t.local.name, e);
							}
						}
					}
				},
			};
		},
		meta: {
			docs: {
				description:
					`Flags effect dependencies that are not memoized. Unmemoized dependencies can cause unnecessary re-renders or infinite loops.`,
			},
			messages: {
				unmemoizedDependency:
					`{{name}} is not memoized. Wrap it in useMemo/useCallback or move it to module scope.`,
			},
			schema: [{
				additionalProperties: !1,
				properties: {
					environment: {
						default: `standard`,
						description: `The React environment: 'roblox-ts' uses @rbxts/react, 'standard' uses react.`,
						enum: [`roblox-ts`, `standard`],
						type: `string`,
					},
					hooks: {
						description: `Array of effect hook entries to check for memoized dependencies`,
						items: {
							additionalProperties: !1,
							properties: {
								dependenciesIndex: {
									description: `Index of the dependencies array for validation`,
									type: `number`,
								},
								name: { description: `The name of the hook`, type: `string` },
							},
							required: [`name`],
							type: `object`,
						},
						type: `array`,
					},
					mode: {
						default: `definite`,
						description:
							`Strictness for memoization detection: definite (only obvious), moderate (unknown calls and non-const), aggressive (any non-module).`,
						enum: [`aggressive`, `definite`, `moderate`],
						type: `string`,
					},
				},
				type: `object`,
			}],
			type: `problem`,
		},
	}),
	vt = { environment: `standard`, requireExplicitGenericOnNewArray: !0 };
function D(e) {
	return e.type === `Identifier`;
}
function yt(e, t) {
	let n = f(t.callee);
	return !D(n) || n.name !== `Array` ? !1 : !m(e, n, `Array`);
}
function bt(e, t) {
	if (
		e.type !== `TSTypeReference` || !D(e.typeName) ||
		e.typeName.name !== `Array` && e.typeName.name !== `ReadonlyArray` || e.typeArguments?.params.length !== 1
	) return;
	let [n] = e.typeArguments.params;
	return n === void 0 ? void 0 : t.getText(n);
}
const xt = /:\s*(Array<.+>|ReadonlyArray<.+>)\s*=/u;
function St(e) {
	return xt.exec(e) !== null;
}
function Ct(e) {
	if (D(e) || e.type === `ArrayPattern` || e.type === `ObjectPattern`) return e.typeAnnotation ?? void 0;
}
function wt(e, t) {
	let { parent: n } = e;
	if (b(n) && n.init === e) {
		let e = Ct(n.id);
		return e === void 0 ? !1 : bt(e.typeAnnotation, t) !== void 0;
	}
	return He(n) && n.right === e ?
		St(t.getText(n)) :
		Ce(n) && n.value === e && n.typeAnnotation !== void 0 && n.typeAnnotation !== null ?
		bt(n.typeAnnotation.typeAnnotation, t) !== void 0 :
		Ve(n) && n.expression === e || Be(n) && n.expression === e ?
		bt(n.typeAnnotation, t) !== void 0 :
		!1;
}
function Tt(e) {
	if (e === void 0) return !1;
	let { typeAnnotation: t } = e;
	return t.type !== `TSTypeReference` || !D(t.typeName) ? !1 : t.typeName.name === `ReadonlyArray`;
}
function Et(e) {
	let t = f(e);
	return T(t) && `value` in t ?
		typeof t.value != `number` :
		Ie(t) || Le(t) || je(t) || Oe(t) || ke(t) ?
		!0 :
		Re(t) ?
		t.expressions.length === 0 :
		ge(t) ?
		t.operator === `void` || t.operator === `typeof` && !t.prefix :
		!1;
}
function Dt(e) {
	return e.type === `Identifier` || e.type === `PrivateIdentifier` ? !0 : O(e);
}
function O(e) {
	let t = f(e);
	if (D(t) || Ue(t)) return !0;
	if (w(t)) return t.optional || t.object.type === `Super` || !O(t.object) ? !1 : t.computed ? O(t.property) : !0;
	if (ge(t)) return t.operator === `delete` ? !1 : O(t.argument);
	if (_e(t) || ve(t)) return O(t.left) && O(t.right);
	if (ye(t)) return O(t.test) && O(t.consequent) && O(t.alternate);
	if (Re(t)) {
		for (let e of t.expressions) if (!O(e)) return !1;
		return !0;
	}
	if (Ie(t)) {
		for (let e of t.elements) if (e !== null && (e.type === `SpreadElement` || !O(e))) return !1;
		return !0;
	}
	if (Le(t)) {
		for (let e of t.properties) {
			if (
				e.type === `SpreadElement` || e.kind !== `init` || e.method || e.computed && !Dt(e.key) || !O(e.value)
			) return !1;
		}
		return !0;
	}
	if (be(t)) {
		for (let e of t.expressions) if (!O(e)) return !1;
		return !0;
	}
	return T(t);
}
function Ot(e, t) {
	let n = f(e);
	if (
		!(!fe(n) || n.optional) && !(!w(n.callee) || n.callee.optional) &&
		!(!D(n.callee.object) || n.callee.object.name !== t)
	) return p(n.callee) === `push` ? n : void 0;
}
function kt(e, t, n) {
	for (let r = t; r < e.length; r += 1) {
		let t = e[r];
		if (!(t === void 0 || !ze(t)) && Ot(t.expression, n) !== void 0) return !0;
	}
	return !1;
}
function At(e, t) {
	let n = [], r = 0;
	for (let i of e) {
		if (i.type === `SpreadElement`) {
			n[r++] = `...${t.getText(i.argument)}`;
			continue;
		}
		n[r++] = t.getText(i);
	}
	return `[${n.join(`, `)}]`;
}
function jt(e, t, n, r, i) {
	if (n.init === null || r.length === 0) return [];
	let [a] = r, o = r.at(-1);
	if (a === void 0 || o === void 0) return [];
	let [s] = a.range;
	for (; s > 0;) {
		let e = t.text[s - 1];
		if (e === ` ` || e === `	`) {
			--s;
			continue;
		}
		e === `
` && --s;
		break;
	}
	return [e.replaceText(n.init, i), e.removeRange([s, o.range[1]])];
}
const Mt = c({
	create(e) {
		let t = e.options?.[0], n = typeof t == `object` && t ? { ...vt, ...t } : { ...vt }, { sourceCode: r } = e;
		function i(t) {
			for (let n = 0; n < t.length; n += 1) {
				let i = t[n];
				if (i === void 0 || !Ee(i) || i.kind !== `const` && i.kind !== `let` || i.declarations.length !== 1) {
					continue;
				}
				let [a] = i.declarations;
				if (
					a === void 0 || !D(a.id) || a.init === null || !Fe(a.init) || !yt(r, a.init) ||
					a.init.arguments.length > 0 || Tt(Ct(a.id))
				) continue;
				let o = a.id.name, s = [], c = [], l = !1, u = n + 1;
				for (; u < t.length;) {
					let e = t[u];
					if (e === void 0 || !ze(e)) break;
					let n = Ot(e.expression, o);
					if (n === void 0 || n.arguments.length === 0) break;
					s.push(e);
					for (let e of n.arguments) {
						if (e.type === `SpreadElement`) {
							l = !0, c.push(`...${r.getText(e.argument)}`);
							continue;
						}
						c.push(r.getText(e));
					}
					u += 1;
				}
				if (s.length === 0 || kt(t, u, o)) continue;
				let d = `[${c.join(`, `)}]`;
				if (
					!(l || s.some((e) => {
						let t = Ot(e.expression, o);
						if (t === void 0) return !0;
						for (let e of t.arguments) if (e.type === `SpreadElement` || !O(e)) return !0;
						return !1;
					}))
				) {
					e.report({
						fix(e) {
							return jt(e, r, a, s, d);
						},
						messageId: `collapseArrayPushInitialization`,
						node: i,
					});
					continue;
				}
				e.report({
					messageId: `collapseArrayPushInitialization`,
					node: i,
					suggest: [{
						fix(e) {
							return jt(e, r, a, s, d);
						},
						messageId: `suggestCollapseArrayPushInitialization`,
					}],
				});
			}
		}
		return {
			BlockStatement(e) {
				i(e.body);
			},
			NewExpression(t) {
				if (!yt(r, t)) return;
				if (t.arguments.length === 0) {
					if (
						!n.requireExplicitGenericOnNewArray ||
						t.typeArguments !== void 0 && t.typeArguments !== null && t.typeArguments.params.length > 0 ||
						wt(t, r)
					) return;
					e.report({ messageId: `requireExplicitGenericOnNewArray`, node: t });
					return;
				}
				if (t.arguments.length > 1) {
					let [i] = t.arguments;
					if (
						i !== void 0 && i.type !== `SpreadElement` && n.environment === `roblox-ts` && !Et(i) ||
						i === void 0
					) return;
					let a = At(t.arguments, r);
					if (!t.arguments.some((e) => e.type === `SpreadElement`)) {
						e.report({
							fix(e) {
								return e.replaceText(t, a);
							},
							messageId: `avoidConstructorEnumeration`,
							node: t,
						});
						return;
					}
					e.report({
						messageId: `avoidConstructorEnumeration`,
						node: t,
						suggest: [{
							fix(e) {
								return e.replaceText(t, a);
							},
							messageId: `suggestArrayLiteral`,
						}],
					});
					return;
				}
				let [i] = t.arguments;
				if (i === void 0) return;
				if (i.type === `SpreadElement`) {
					e.report({
						messageId: `avoidSingleArgumentConstructor`,
						node: t,
						suggest: [{
							fix(e) {
								return e.replaceText(t, `[...${r.getText(i.argument)}]`);
							},
							messageId: `suggestArrayLiteral`,
						}],
					});
					return;
				}
				if (!Et(i)) {
					if (
						n.environment === `roblox-ts` ||
						t.typeArguments !== void 0 && t.typeArguments !== null && t.typeArguments.params.length > 0
					) return;
					let a = r.getText(i);
					e.report({
						messageId: `avoidLengthConstructorInStandard`,
						node: t,
						suggest: [{
							fix(e) {
								return e.replaceText(t, `Array.from({ length: ${a} })`);
							},
							messageId: `suggestArrayFromLength`,
						}],
					});
					return;
				}
				let a = `[${r.getText(i)}]`;
				e.report({
					fix(e) {
						return e.replaceText(t, a);
					},
					messageId: `avoidSingleArgumentConstructor`,
					node: t,
				});
			},
			Program(e) {
				i(e.body);
			},
		};
	},
	meta: {
		docs: {
			description: `Disallow array constructor element forms and enforce roblox-ts-aware constructor patterns.`,
		},
		fixable: `code`,
		hasSuggestions: !0,
		messages: {
			avoidConstructorEnumeration:
				`Do not use Array constructor enumeration arguments. Use an array literal instead.`,
			avoidLengthConstructorInStandard:
				`Length-based Array constructor is not allowed in standard mode. Prefer Array.from({ length: n }).`,
			avoidSingleArgumentConstructor:
				`Single-argument Array constructor form is not allowed here. Use an array literal instead.`,
			collapseArrayPushInitialization:
				`Collapse new Array<T>() + consecutive .push(...) calls into a single array literal initializer.`,
			requireExplicitGenericOnNewArray:
				`new Array() must use an explicit generic argument or a contextual Array<T>/ReadonlyArray<T> annotation.`,
			suggestArrayFromLength: `Replace with Array.from({ length: value }).`,
			suggestArrayLiteral: `Replace constructor form with an array literal.`,
			suggestCollapseArrayPushInitialization:
				`Collapse constructor + push sequence into a single array literal initializer.`,
		},
		schema: [{
			additionalProperties: !1,
			properties: {
				environment: {
					default: `standard`,
					description:
						`Array constructor environment mode: 'roblox-ts' allows new Array(length); 'standard' reports it.`,
					enum: [`roblox-ts`, `standard`],
					type: `string`,
				},
				requireExplicitGenericOnNewArray: {
					default: !0,
					description:
						`When true, zero-argument new Array() requires explicit generic type arguments or contextual array typing.`,
					type: `boolean`,
				},
			},
			type: `object`,
		}],
		type: `problem`,
	},
});
function Nt(e) {
	return e.type !== `PrivateIdentifier`;
}
function Pt(e, t, n) {
	if (e.type !== t.type) return !1;
	switch (e.type) {
		case `CallExpression`:
			return t.type === `CallExpression` && n.getText(e) === n.getText(t);
		case `Identifier`:
			return t.type === `Identifier` && e.name === t.name;
		case `Literal`:
			return t.type === `Literal` && e.value === t.value && e.raw === t.raw;
		case `MemberExpression`:
			return t.type !== `MemberExpression` || e.computed !== t.computed || e.optional !== t.optional ||
					!Pt(e.object, t.object, n) ?
				!1 :
				e.computed ?
				!Nt(e.property) || !Nt(t.property) ? !1 : Pt(e.property, t.property, n) :
				e.property.type === `PrivateIdentifier` || t.property.type === `PrivateIdentifier` ?
				e.property.type === `PrivateIdentifier` && t.property.type === `PrivateIdentifier` &&
				e.property.name === t.property.name :
				t.property.type === `Identifier` && e.property.name === t.property.name;
		case `Super`:
			return t.type === `Super`;
		case `ThisExpression`:
			return t.type === `ThisExpression`;
		default:
			return !1;
	}
}
function Ft(e) {
	switch (e.type) {
		case `Identifier`:
		case `Literal`:
		case `ThisExpression`:
			return !0;
		case `MemberExpression`:
			return e.optional || !It(e.object) ?
				!1 :
				e.computed ?
				Nt(e.property) ? Ft(e.property) : !1 :
				e.property.type === `Identifier` || e.property.type === `PrivateIdentifier`;
		default:
			return !1;
	}
}
function It(e) {
	switch (e.type) {
		case `Identifier`:
		case `ThisExpression`:
			return !0;
		case `MemberExpression`:
			return e.optional || !It(e.object) ?
				!1 :
				e.computed ?
				Nt(e.property) ? Ft(e.property) : !1 :
				e.property.type === `Identifier` || e.property.type === `PrivateIdentifier`;
		default:
			return !1;
	}
}
function Lt(e) {
	return e.type !== `CallExpression` || e.optional || e.arguments.length > 0 ||
			e.callee.type !== `MemberExpression` || e.callee.optional || e.callee.computed ||
			e.callee.property.type !== `Identifier` ?
		!1 :
		e.callee.property.name === `size`;
}
function Rt(e) {
	return typeof e != `object` || !e ?
		!1 :
		`allowAutofix` in e ?
		e.allowAutofix === void 0 || typeof e.allowAutofix == `boolean` :
		!0;
}
const zt = c({
		create(e) {
			let [t] = e.options, n = Rt(t) && t.allowAutofix === !0, { sourceCode: r } = e;
			return {
				AssignmentExpression(t) {
					if (
						t.operator !== `=` || t.left.type !== `MemberExpression` || !t.left.computed ||
						!Lt(t.left.property) || !Pt(t.left.object, t.left.property.callee.object, r)
					) return;
					let i = t.parent.type === `ExpressionStatement` ? t.parent : void 0;
					if (!(n && i !== void 0 && It(t.left.object))) {
						e.report({ messageId: `usePush`, node: t });
						return;
					}
					let a = r.getText(t.left.object), o = r.getText(t.right);
					e.report({
						fix(e) {
							return e.replaceText(i, `${a}.push(${o});`);
						},
						messageId: `usePush`,
						node: t,
					});
				},
			};
		},
		meta: {
			docs: {
				description:
					`Disallow array append assignments using array[array.size()] = value and prefer push-based appends.`,
			},
			fixable: `code`,
			messages: { usePush: `Do not append with array[array.size()] = value. Use array.push(value) instead.` },
			schema: [{
				additionalProperties: !1,
				properties: { allowAutofix: { default: !1, type: `boolean` } },
				type: `object`,
			}],
			type: `problem`,
		},
	}),
	Bt = /^set[A-Z]/u;
function k({ callee: e }) {
	if (e.type === `Identifier`) return e.name;
	if (e.type === `MemberExpression` && e.property.type === `Identifier`) return e.property.name;
}
function Vt(e) {
	return Bt.test(e);
}
function Ht(e) {
	let [t] = e.arguments;
	return t?.type === `ArrowFunctionExpression` || t?.type === `FunctionExpression` ? t : void 0;
}
function Ut(e, t) {
	let n = [e];
	for (; n.length > 0;) {
		let e = n.pop();
		if (e === void 0) break;
		t(e);
		for (let t in e) {
			if (re(t)) continue;
			let r = Reflect.get(e, t);
			if (!(typeof r != `object` || !r) && r !== e.parent) {
				if (Array.isArray(r)) {
					for (let e = r.length - 1; e >= 0; --e) {
						let t = r[e];
						v(t) && n.push(t);
					}
					continue;
				}
				v(r) && n.push(r);
			}
		}
	}
}
function Wt(e, t) {
	t(e);
	for (let n of Object.values(e)) {
		if (Array.isArray(n)) {
			for (let r of n) r !== e.parent && v(r) && Wt(r, t);
			continue;
		}
		n !== e.parent && v(n) && Wt(n, t);
	}
}
function Gt(e) {
	let t = 0;
	return Ut(e, (e) => {
		e.type !== `CallExpression` || e.callee.type !== `Identifier` || Vt(e.callee.name) && (t += 1);
	}),
		t;
}
function Kt(e, t, n, r, i) {
	if (t === void 0) return 0;
	if (t.type === `SpreadElement`) return 3;
	let a = f(t);
	return a.type === `ArrayExpression` ? a.elements.length === 0 ? 1 : i(e, a, n, r) ? 2 : 3 : 3;
}
const qt = new Set([`catch`, `finally`, `then`]);
function Jt(e) {
	let t = new Set();
	for (let n of e.body) {
		n.type !== `MethodDefinition` || n.kind !== `method` || !n.value.async ||
			n.key.type === `Identifier` && t.add(n.key.name);
	}
	return t;
}
function Yt(e) {
	return e.callee.type !== `MemberExpression` || e.callee.property.type !== `Identifier` ?
		!1 :
		qt.has(e.callee.property.name);
}
function Xt({ callee: e }) {
	return (e.type === `ArrowFunctionExpression` || e.type === `FunctionExpression`) && e.async;
}
function Zt({ callee: e }, t) {
	if (!(e.type !== `MemberExpression` || e.object.type !== `ThisExpression` || e.property.type !== `Identifier`)) {
		return t.has(e.property.name) ? e.property.name : void 0;
	}
}
function Qt(e) {
	let { parent: t } = e;
	return t?.type !== `AssignmentExpression` || t.right !== e ?
		!1 :
		t.left.type === `MemberExpression` && t.left.object.type === `ThisExpression`;
}
function $t(e) {
	let { parent: t } = e;
	if (!(t?.type !== `VariableDeclarator` || t.init !== e)) return t.id.type === `Identifier` ? t.id.name : void 0;
}
function en(e) {
	return e.type !== `ArrowFunctionExpression` && e.type !== `FunctionExpression` ?
		!1 :
		e.parent.type !== `CallExpression` || e.parent.callee !== e;
}
function tn(e, t) {
	let n = e;
	for (; n !== t;) {
		let { parent: e } = n;
		if (e === null) return !1;
		if (en(e)) return !0;
		n = e;
	}
	return !1;
}
function nn(e, t) {
	let n = Zt(e, t);
	if (n === void 0 || Qt(e)) return;
	if (e.parent.type === `ExpressionStatement`) {
		return { data: { methodName: n }, messageId: `unhandledAsyncCall`, node: e };
	}
	let r = $t(e);
	if (r !== void 0) return { data: { variableName: r }, messageId: `orphanedPromise`, node: e };
}
function rn(e, t) {
	let n = [], r = 0;
	function i(i) {
		if (i !== e && tn(i, e)) return;
		if (i.type === `AwaitExpression`) {
			n[r++] = { messageId: `awaitInConstructor`, node: i };
			return;
		}
		if (i.type !== `CallExpression`) return;
		Yt(i) && (n[r++] = { messageId: `promiseChainInConstructor`, node: i }),
			Xt(i) && (n[r++] = { messageId: `asyncIifeInConstructor`, node: i });
		let a = nn(i, t);
		a !== void 0 && (n[r++] = a);
	}
	return Wt(e, i), n;
}
const an = c({
		create(e) {
			function t(t) {
				e.report({ data: t.data, messageId: t.messageId, node: t.node });
			}
			return {
				"MethodDefinition[kind='constructor']"(e) {
					if (
						e.value.type !== `FunctionExpression` || e.value.body?.type !== `BlockStatement` ||
						e.parent.type !== `ClassBody`
					) return;
					let n = Jt(e.parent), r = e.value.body, i = rn(r, n);
					for (let e of i) t(e);
				},
			};
		},
		meta: {
			docs: {
				description:
					`Disallow asynchronous operations inside class constructors. Constructors return immediately, so async work causes race conditions, unhandled rejections, and incomplete object states.`,
			},
			messages: {
				asyncIifeInConstructor:
					`Refactor this asynchronous operation outside of the constructor. Async IIFEs create unhandled promises and incomplete object state.`,
				awaitInConstructor:
					`Refactor this asynchronous operation outside of the constructor. Using 'await' in a constructor causes the class to be instantiated before the async operation completes.`,
				orphanedPromise:
					`Refactor this asynchronous operation outside of the constructor. Promise assigned to '{{variableName}}' is never consumed - errors will be silently swallowed.`,
				promiseChainInConstructor:
					`Refactor this asynchronous operation outside of the constructor. Promise chains (.then/.catch/.finally) in constructors lead to race conditions.`,
				unhandledAsyncCall:
					`Refactor this asynchronous operation outside of the constructor. Calling async method '{{methodName}}' without handling its result creates uncontrolled async behavior.`,
			},
			schema: [],
			type: `problem`,
		},
	}),
	on = new Set([
		`useAsyncEffect`,
		`useEffect`,
		`useInsertionEffect`,
		`useLayoutEffect`,
		`useMountEffect`,
		`useReactiveEffect`,
		`useUnmountEffect`,
		`useUpdateEffect`,
	]),
	sn = c({
		create(e) {
			return {
				CallExpression(t) {
					let n = k(t);
					if (n === void 0 || !on.has(n)) return;
					let r = Ht(t);
					if (r === void 0) return;
					let i = Gt(r);
					i < 3 || e.report({ data: { count: String(i) }, messageId: `cascadingSetState`, node: t });
				},
			};
		},
		meta: {
			docs: { description: `Disallow effect hooks with many cascading state updates.`, recommended: !0 },
			messages: {
				cascadingSetState:
					`{{count}} setState calls in a single useEffect — consider using useReducer or deriving state`,
			},
			type: `problem`,
		},
	});
function cn(e, t) {
	let n = e.scan(t);
	return n === 0 ? 0 : 1 - (1 - e.probability) ** n;
}
function ln(e, t) {
	let n = 0;
	for (let r of e) {
		let e = cn(r, t);
		n = 1 - (1 - n) * (1 - e);
	}
	return n;
}
function un(e, t) {
	return ln(e, t) >= .9;
}
function dn(e, t) {
	return t.some((t) => un(e, t));
}
function fn(e) {
	return {
		probability: e,
		scan(e) {
			for (let t = 0; t < e.length - 1; t += 1) {
				let n = e.charAt(t), r = e.charAt(t + 1);
				if (n === n.toLowerCase() && r === r.toUpperCase() && r !== r.toLowerCase()) return 1;
			}
			return 0;
		},
	};
}
const pn = /[-/^$*+?.()|[\]{}]/gu, mn = String.raw`\$&`, hn = /\s+/gu;
function gn(e) {
	return e.replaceAll(pn, mn);
}
function _n(e, t) {
	let n = t.map((e) => typeof e == `string` ? new RegExp(gn(e), `ug`) : new RegExp(e.source, `ug`));
	return {
		probability: e,
		scan(e) {
			let t = e.replace(hn, ``), r = 0;
			for (let e of n) {
				e.lastIndex = 0;
				let n = t.match(e);
				n && (r += n.length);
			}
			return r;
		},
	};
}
const vn = /\s/v;
function yn(e, t) {
	let n = new Set(t);
	return {
		probability: e,
		scan(e) {
			for (let t = e.length - 1; t >= 0; --t) {
				let r = e.charAt(t);
				if (n.has(r)) return 1;
				if (!vn.test(r) && r !== `*` && r !== `/`) return 0;
			}
			return 0;
		},
	};
}
const bn = /[ \t(),{}]/u;
function xn(e, t) {
	let n = new Set(t);
	return {
		probability: e,
		scan(e) {
			let t = e.split(bn), r = 0;
			for (let e of t) n.has(e) && (r += 1);
			return r;
		},
	};
}
const Sn =
		`public.abstract.class.implements.extends.return.throw.private.protected.enum.continue.assert.boolean.this.instanceof.interface.static.void.super.true.case:.let.const.var.async.await.break.yield.typeof.import.export`
			.split(`.`),
	Cn = [`++`, `||`, `&&`, `===`, `?.`, `??`],
	wn = [
		`for(`,
		`if(`,
		`while(`,
		`catch(`,
		`switch(`,
		`try{`,
		`else{`,
		`this.`,
		`window.`,
		/;\s+\/\//u,
		`import '`,
		`import "`,
		`require(`,
	],
	Tn = [`}`, `;`, `{`];
function En() {
	return [yn(.95, Tn), xn(.7, Cn), xn(.3, Sn), _n(.95, wn), fn(.5)];
}
const Dn = new Set([`BreakStatement`, `ContinueStatement`, `LabeledStatement`]);
function On(e) {
	return Dn.has(e.type);
}
const kn = En();
function An(e, t, n) {
	let r = e.loc.start.line, i = t.loc.start.line;
	if (r + 1 !== i) return !1;
	let a = n.getTokenAfter(e);
	return a ? a.loc.start.line > i : !0;
}
function jn(e, t) {
	let n = [], r = 0, i = [], a = 0;
	for (let o of e) {
		if (o.type === `Block`) {
			a > 0 && (n[r++] = {
				comments: i,
				value: i.map(({ value: e }) => e).join(`
`),
			},
				i = [],
				a = 0), n[r++] = { comments: [o], value: o.value };
		} else if (a === 0) i[a++] = o;
		else {
			let e = i.at(-1);
			e && An(e, o, t) ? i[a++] = o : (n[r++] = {
				comments: i,
				value: i.map(({ value: e }) => e).join(`
`),
			},
				i = [o],
				a = 1);
		}
	}
	return a > 0 && (n[r] = {
		comments: i,
		value: i.map(({ value: e }) => e).join(`
`),
	}),
		n;
}
const Mn = /\{/gv, Nn = /\}/gv;
function Pn(e) {
	let t = (e.match(Mn) ?? []).length - (e.match(Nn) ?? []).length;
	return t > 0 ? e + `}`.repeat(t) : t < 0 ? `{`.repeat(-t) + e : e;
}
function Fn(e) {
	return dn(
		kn,
		e.split(`
`),
	);
}
function In(e) {
	return e.type !== `ReturnStatement` && e.type !== `ThrowStatement` ? !1 : e.argument?.type === `Identifier`;
}
function Ln(e) {
	return e.type === `UnaryExpression` && (e.operator === `-` || e.operator === `+`);
}
function Rn(e) {
	return e.type === `Literal` && (typeof e.value == `string` || typeof e.value == `number`);
}
function zn(e) {
	return h(e) && typeof e.type == `string`;
}
function Bn(e) {
	let t = [], n = 0;
	for (let r of e) zn(r) && (t[n++] = r);
	return t;
}
function Vn(e, t) {
	if (e.type !== `ExpressionStatement`) return !1;
	let { expression: n } = e;
	return n.type === `Identifier` || n.type === `SequenceExpression` || Ln(n) || Rn(n) || !t.trimEnd().endsWith(`;`);
}
function Hn(e, t) {
	if (e.length !== 1) return !1;
	let n = e.at(0);
	return n ? On(n) || In(n) || Vn(n, t) : !1;
}
const Un = [/A 'return' statement can only be used within a function body/v];
function Wn(e) {
	for (let t of e) {
		let e = !1;
		for (let n of Un) {
			if (n.test(t.message)) {
				e = !0;
				break;
			}
		}
		if (!e) return !1;
	}
	return !0;
}
function Gn(e) {
	return (e.errors.length === 0 || Wn(e.errors)) && e.program.body.length > 0;
}
function Kn(e, t) {
	let r = n(t), a = i(`file${r || `.js`}`, e);
	if (Gn(a)) return a;
	if (r !== `.tsx` && r !== `.jsx`) {
		let t = i(`file.tsx`, e);
		if (Gn(t)) return t;
	}
}
function qn(e, t) {
	if (!Fn(e)) return !1;
	let n = Kn(e, t);
	return n ? !Hn(Bn(n.program.body), e) : !1;
}
const Jn = c({
	create(e) {
		return {
			"Program:exit"() {
				let t = jn(e.sourceCode.getAllComments(), e.sourceCode);
				for (let n of t) {
					let t = n.value.trim();
					if (t === `}` || !qn(Pn(t), e.filename)) continue;
					let r = n.comments.at(0), i = n.comments.at(-1);
					!r || !i ||
						e.report({
							loc: { end: i.loc.end, start: r.loc.start },
							messageId: `commentedCode`,
							suggest: [{
								desc: `Remove this commented out code`,
								fix(e) {
									return e.removeRange([r.range[0], i.range[1]]);
								},
							}],
						});
				}
			},
		};
	},
	meta: {
		docs: { description: `Disallow commented-out code`, recommended: !1 },
		hasSuggestions: !0,
		messages: {
			commentedCode:
				`Commented-out code creates confusion about intent and clutters the codebase. Version control preserves history, making dead code comments unnecessary. Delete the commented code entirely. If needed later, retrieve it from git history.`,
		},
		schema: [],
		type: `suggestion`,
	},
});
function A(e) {
	return { constant: !0, value: e };
}
function j() {
	return { constant: !1 };
}
function Yn(e) {
	return { constant: !0, value: e };
}
function M() {
	return { constant: !1 };
}
function Xn(e) {
	let t = new Set();
	if (!e?.loopExitCalls) return t;
	for (let n of e.loopExitCalls) g(n) && t.add(n);
	return t;
}
function Zn(e) {
	let t = f(e);
	if (t.type === `Identifier`) return t.name;
	if (t.type !== `MemberExpression`) return;
	let n = Zn(t.object);
	if (n === void 0 || n.length === 0) return;
	let r = p(t);
	if (!(r === void 0 || r.length === 0)) return `${n}.${r}`;
}
function Qn(e, t) {
	if (t.size === 0) return !1;
	let n = Zn(e.callee);
	return n === void 0 || n.length === 0 ? !1 : t.has(n);
}
function N(e, t) {
	if (t.size === 0) return !1;
	let n = f(e);
	switch (n.type) {
		case `ArrayExpression`:
			for (let e of n.elements) {
				if (e) {
					if (e.type === `SpreadElement`) {
						if (N(e.argument, t)) return !0;
						continue;
					}
					if (N(e, t)) return !0;
				}
			}
			return !1;
		case `ArrowFunctionExpression`:
		case `ClassExpression`:
		case `FunctionExpression`:
			return !1;
		case `AssignmentExpression`:
			return N(n.right, t);
		case `AwaitExpression`:
			return N(n.argument, t);
		case `BinaryExpression`: {
			let { left: e } = n;
			return e.type !== `PrivateIdentifier` && N(e, t) ? !0 : N(n.right, t);
		}
		case `CallExpression`:
			if (Qn(n, t) || N(n.callee, t)) return !0;
			for (let e of n.arguments) {
				if (e.type === `SpreadElement`) {
					if (N(e.argument, t)) return !0;
					continue;
				}
				if (N(e, t)) return !0;
			}
			return !1;
		case `ConditionalExpression`:
			return N(n.test, t) || N(n.consequent, t) || N(n.alternate, t);
		case `LogicalExpression`:
			return N(n.left, t) || N(n.right, t);
		case `MemberExpression`:
			return N(n.object, t) ? !0 : n.computed ? N(n.property, t) : !1;
		case `NewExpression`:
			if (N(n.callee, t)) return !0;
			for (let e of n.arguments) {
				if (e.type === `SpreadElement`) {
					if (N(e.argument, t)) return !0;
					continue;
				}
				if (N(e, t)) return !0;
			}
			return !1;
		case `SequenceExpression`:
			return n.expressions.some((e) => N(e, t));
		case `TaggedTemplateExpression`:
			return N(n.tag, t) ? !0 : n.quasi.expressions.some((e) => N(e, t));
		case `TemplateLiteral`:
			return n.expressions.some((e) => N(e, t));
		case `UnaryExpression`:
		case `UpdateExpression`:
			return N(n.argument, t);
		case `YieldExpression`:
			return n.argument ? N(n.argument, t) : !1;
		default:
			return !1;
	}
}
function P(e) {
	let t = f(e);
	switch (t.type) {
		case `ArrayExpression`:
			return A([]);
		case `ArrowFunctionExpression`:
		case `ClassExpression`:
		case `FunctionExpression`:
			return A(!0);
		case `Identifier`:
			return t.name === `undefined` ?
				A(void 0) :
				t.name === `NaN` ?
				A(NaN) :
				t.name === `Infinity` ?
				A(1 / 0) :
				j();
		case `Literal`:
			return A(t.value);
		case `LogicalExpression`: {
			let e = P(t.left);
			return e.constant ?
				t.operator === `&&` ?
					e.value === !0 ? P(t.right) : A(e.value) :
					t.operator === `||` ?
					e.value === !0 ? A(e.value) : P(t.right) :
					e.value === void 0 ?
					P(t.right) :
					A(e.value) :
				j();
		}
		case `ObjectExpression`:
			return A({});
		case `SequenceExpression`: {
			let e = t.expressions.at(-1);
			return e ? P(e) : j();
		}
		case `TemplateLiteral`:
			return t.expressions.length > 0 ? j() : t.quasis.length === 0 ? A(``) : A(t.quasis[0]?.value.cooked ?? ``);
		case `UnaryExpression`: {
			if (t.operator === `typeof`) return A(`string`);
			if (t.operator === `void`) return A(void 0);
			let e = P(t.argument);
			return e.constant ?
				t.operator === `!` ?
					A(!e.value) :
					t.operator === `+` && typeof e.value == `number` ?
					A(e.value) :
					t.operator === `-` && typeof e.value == `number` ?
					A(-e.value) :
					t.operator === `~` && typeof e.value == `number` ?
					A(~e.value) :
					j() :
				j();
		}
		default:
			return j();
	}
}
function F(e) {
	let t = f(e);
	if (t.type === `ConditionalExpression`) {
		let e = F(t.test);
		if (e.constant) return F(e.value === !0 ? t.consequent : t.alternate);
		let n = F(t.consequent), r = F(t.alternate);
		return n.constant && r.constant && n.value === r.value ? n : M();
	}
	if (t.type === `LogicalExpression`) {
		let e = F(t.left);
		if (!e.constant) return M();
		if (t.operator === `&&`) return e.value ? F(t.right) : Yn(!1);
		if (t.operator === `||`) return e.value === !0 ? Yn(!0) : F(t.right);
		let n = P(t.left);
		return n.constant ? n.value === void 0 ? F(t.right) : Yn(!!n.value) : M();
	}
	if (t.type === `SequenceExpression`) {
		let e = t.expressions.at(-1);
		return e ? F(e) : M();
	}
	let n = P(t);
	return n.constant ? Yn(!!n.value) : M();
}
const $n = new Set([`DoWhileStatement`, `ForInStatement`, `ForOfStatement`, `ForStatement`, `WhileStatement`]);
function er(e) {
	return $n.has(e.type);
}
const tr = new Set([`ArrowFunctionExpression`, `FunctionDeclaration`, `FunctionExpression`]);
function nr(e) {
	return tr.has(e.type);
}
function rr(e, t) {
	let n = t;
	for (; n !== null;) {
		if (n.type === `LabeledStatement` && n.label.name === e) return n.body;
		if (n.type === `Program`) return;
		n = n.parent;
	}
}
function ir(e, t) {
	if (e.label) return rr(e.label.name, e.parent) === t;
	let n = e.parent;
	for (; n !== null;) {
		if (n.type === `Program` || nr(n) || n.type === `SwitchStatement`) return !1;
		if (er(n)) return n === t;
		n = n.parent;
	}
	return !1;
}
function ar(e, t) {
	return e ? e.type === `VariableDeclaration` ? e.declarations.some((e) => e.init ? N(e.init, t) : !1) : N(e, t) : !1;
}
function or(e, t) {
	switch (e.type) {
		case `DoWhileStatement`:
		case `WhileStatement`:
			return N(e.test, t);
		case `ForInStatement`:
		case `ForOfStatement`:
			return N(e.right, t);
		case `ForStatement`:
			return !!(ar(e.init, t) || e.test && N(e.test, t) || e.update && N(e.update, t));
		default:
			return !1;
	}
}
function I(e, t, n) {
	switch (e.type) {
		case `BlockStatement`:
			return e.body.some((e) => I(e, t, n));
		case `BreakStatement`:
			return ir(e, t);
		case `DoWhileStatement`:
		case `WhileStatement`:
			return N(e.test, n) ? !0 : I(e.body, t, n);
		case `ExpressionStatement`:
			return N(e.expression, n);
		case `ForInStatement`:
		case `ForOfStatement`:
			return N(e.right, n) ? !0 : I(e.body, t, n);
		case `ForStatement`:
			return ar(e.init, n) || e.test && N(e.test, n) || e.update && N(e.update, n) ? !0 : I(e.body, t, n);
		case `IfStatement`:
			return I(e.consequent, t, n) ? !0 : e.alternate ? I(e.alternate, t, n) : !1;
		case `LabeledStatement`:
			return I(e.body, t, n);
		case `ReturnStatement`:
			return !0;
		case `SwitchStatement`:
			return e.cases.some((e) => e.consequent.some((e) => I(e, t, n)));
		case `TryStatement`:
			return !!(I(e.block, t, n) || e.handler && I(e.handler.body, t, n) || e.finalizer && I(e.finalizer, t, n));
		case `VariableDeclaration`:
			return e.declarations.some((e) => e.init ? N(e.init, n) : !1);
		case `WithStatement`:
			return N(e.object, n) ? !0 : I(e.body, t, n);
		default:
			return !1;
	}
}
function sr(e, t, n) {
	return e.constant ? e.value ? or(t, n) ? !1 : !I(t.body, t, n) : !0 : !1;
}
const cr = c({
		create(e) {
			let t = e.options?.[0], n = Xn(typeof t == `object` && t ? t : void 0);
			function r(t) {
				F(t).constant && e.report({ messageId: `unexpected`, node: t });
			}
			return {
				ConditionalExpression(e) {
					r(e.test);
				},
				DoWhileStatement(t) {
					sr(F(t.test), t, n) && e.report({ messageId: `unexpected`, node: t.test });
				},
				ForStatement(t) {
					t.test && sr(F(t.test), t, n) && e.report({ messageId: `unexpected`, node: t.test });
				},
				IfStatement(e) {
					r(e.test);
				},
				WhileStatement(t) {
					sr(F(t.test), t, n) && e.report({ messageId: `unexpected`, node: t.test });
				},
			};
		},
		meta: {
			docs: {
				description:
					`Disallow constant conditions, but allow constant loops that include loop exits such as break, return, or configured calls.`,
			},
			messages: { unexpected: `Unexpected constant condition.` },
			schema: [{
				additionalProperties: !1,
				properties: { loopExitCalls: { items: { minLength: 1, type: `string` }, type: `array` } },
				type: `object`,
			}],
			type: `problem`,
		},
	}),
	lr = /^[A-Z]/v;
function L(e) {
	return lr.test(e);
}
function ur(e) {
	return e.type === `FunctionDeclaration` && e.id !== null && L(e.id.name);
}
function dr(e) {
	return e.type === `CallExpression` ?
		e.callee.type === `Identifier` ?
			e.callee.name === `memo` :
			e.callee.type === `MemberExpression` && e.callee.object.type === `Identifier` &&
			e.callee.object.name === `React` && e.callee.property.type === `Identifier` &&
			e.callee.property.name === `memo` :
		!1;
}
function R(e) {
	if (e.type === `BinaryExpression`) {
		switch (e.operator) {
			case `%`:
			case `*`:
			case `**`:
			case `+`:
			case `-`:
			case `/`:
				return R(e.left) && R(e.right);
			default:
				return !1;
		}
	}
	return e.type === `Identifier` || e.type === `Literal` ?
		!0 :
		e.type === `MemberExpression` ?
		!e.computed && R(e.object) :
		e.type === `ParenthesizedExpression` ?
		R(e.expression) :
		e.type === `TemplateLiteral` ?
		e.expressions.length === 0 :
		e.type === `UnaryExpression` ?
		R(e.argument) :
		!1;
}
function fr(e, t) {
	return e?.type === `CallExpression` && e.callee.type === `Identifier` &&
		(typeof t == `string` ? e.callee.name === t : t.has(e.callee.name));
}
function pr(e) {
	return e.type === `VariableDeclarator` && e.id.type === `Identifier` && L(e.id.name) && e.init !== null &&
		(e.init.type === `ArrowFunctionExpression` || e.init.type === `FunctionExpression`);
}
function mr(e) {
	return e.loc.end.line - e.loc.start.line + 1;
}
function hr(e) {
	if (
		!(e.type !== `FunctionDeclaration` || !ur(e) || e.id === null || e.body === null) &&
		!(!v(e.id) || !(`name` in e.id) || typeof e.id.name != `string`)
	) return { body: e.body, name: e.id.name, nameNode: e.id };
}
function gr(e) {
	if (
		e.type !== `VariableDeclarator` || !pr(e) || e.init === null || !(`name` in e.id) ||
		typeof e.id.name != `string` ||
		e.init.type !== `ArrowFunctionExpression` && e.init.type !== `FunctionExpression` || !v(e.init.body)
	) return;
	let { name: t } = e.id;
	return typeof t == `string` ? { body: e.init.body, name: t, nameNode: e.id } : void 0;
}
const _r = c({
	create(e) {
		function t(t, n, r) {
			let i = mr(r);
			i <= 300 || e.report({ data: { lineCount: String(i), name: n }, messageId: `giantComponent`, node: t });
		}
		return {
			FunctionDeclaration(e) {
				let n = hr(e);
				n !== void 0 && t(n.nameNode, n.name, n.body);
			},
			VariableDeclarator(e) {
				let n = gr(e);
				n !== void 0 && t(n.nameNode, n.name, n.body);
			},
		};
	},
	meta: {
		docs: {
			description: `Report React components whose bodies exceed the configured size threshold.`,
			recommended: !0,
		},
		messages: {
			giantComponent:
				`Component "{{name}}" is {{lineCount}} lines — consider breaking it into smaller focused components`,
		},
		type: `problem`,
	},
});
function vr(e) {
	return e.name.type === `JSXIdentifier` ? e.name.name : void 0;
}
function yr(e) {
	switch (e.type) {
		case `ArrayExpression`:
			return `array`;
		case `ArrowFunctionExpression`:
		case `FunctionExpression`:
			return `function`;
		case `JSXElement`:
		case `JSXFragment`:
			return `JSX`;
		case `ObjectExpression`:
			return `object`;
		default:
			return;
	}
}
const br = c({
		create(e) {
			let t = new Set();
			return {
				JSXAttribute(n) {
					if (
						n.value?.type !== `JSXExpressionContainer` || n.value.expression.type === `JSXEmptyExpression`
					) return;
					let r = n.parent;
					if (!le(r)) return;
					let i = vr(r);
					if (i === void 0 || !t.has(i)) return;
					let a = yr(n.value.expression);
					a !== void 0 &&
						e.report({ data: { name: i, type: a }, messageId: `inlineProperty`, node: n.value.expression });
				},
				VariableDeclarator(e) {
					e.id.type === `Identifier` && e.init !== null && dr(e.init) && t.add(e.id.name);
				},
			};
		},
		meta: {
			docs: {
				description: `Prevent inline properties from being passed to memoized components.`,
				recommended: !0,
			},
			messages: {
				inlineProperty:
					`Inline {{type}} passed to memoized component "{{name}}" — new references cause unnecessary re-renders`,
			},
			type: `problem`,
		},
	}),
	xr = { checkPrivate: !0, checkProtected: !0, checkPublic: !0 };
function Sr(e) {
	return h(e) ?
		{
			checkPrivate: typeof e.checkPrivate == `boolean` ? e.checkPrivate : !0,
			checkProtected: typeof e.checkProtected == `boolean` ? e.checkProtected : !0,
			checkPublic: typeof e.checkPublic == `boolean` ? e.checkPublic : !0,
		} :
		xr;
}
function Cr(e, t) {
	if (e.static || e.kind !== `method`) return !1;
	let n = e.accessibility ?? `public`;
	return !(n === `private` && !t.checkPrivate || n === `protected` && !t.checkProtected ||
		n === `public` && !t.checkPublic);
}
function wr(e, t) {
	if (t.has(e)) return !1;
	if (t.add(e), e.type === `ThisExpression` || e.type === `Super`) return !0;
	if (!h(e)) return !1;
	for (let n in e) {
		if (!Object.hasOwn(e, n)) continue;
		let r = e[n];
		if (r !== void 0) {
			if (Array.isArray(r)) {
				for (let e of r) if (v(e) && wr(e, t)) return !0;
				continue;
			}
			if (v(r) && wr(r, t)) return !0;
		}
	}
	return !1;
}
function Tr({ value: e }) {
	return e.type === `FunctionExpression` ? wr(e, new WeakSet()) : !1;
}
function Er(e) {
	return e.key.type === `Identifier` ? e.key.name : `unknown`;
}
const Dr = c({
		create(e) {
			let t = Sr(e.options[0]);
			return {
				MethodDefinition(n) {
					!Cr(n, t) || Tr(n) ||
						e.report({ data: { methodName: Er(n) }, messageId: `noInstanceMethodWithoutThis`, node: n });
				},
			};
		},
		meta: {
			docs: {
				description:
					`Detect instance methods that do not use 'this' and suggest converting them to standalone functions for better performance in roblox-ts.`,
			},
			messages: {
				noInstanceMethodWithoutThis:
					`Method '{{methodName}}' does not use 'this' and creates unnecessary metatable overhead in roblox-ts. Convert it to a standalone function for better performance.`,
			},
			schema: [{
				additionalProperties: !1,
				properties: {
					checkPrivate: {
						default: !0,
						description: `Check private methods (default: true)`,
						type: `boolean`,
					},
					checkProtected: {
						default: !0,
						description: `Check protected methods (default: true)`,
						type: `boolean`,
					},
					checkPublic: { default: !0, description: `Check public methods (default: true)`, type: `boolean` },
				},
				type: `object`,
			}],
			type: `problem`,
		},
	}),
	Or = new Set([`JSXElement`, `ReactElement`, `ReactNode`]),
	kr = /^use[A-Z]/u;
function Ar(e) {
	return kr.test(e);
}
function jr(e) {
	if (!(`typeAnnotation` in e)) return;
	let { typeAnnotation: t } = e;
	return ie(t) ? t : void 0;
}
function Mr(e) {
	if (e?.type !== `TSTypeReference`) return !1;
	let { typeName: t } = e;
	return t.type === `Identifier` ? Or.has(t.name) : t.type === `TSQualifiedName` ? Or.has(t.right.name) : !1;
}
function Nr(e) {
	let { returnType: t } = e;
	if (t != null) return t.typeAnnotation;
}
function Pr(e) {
	if (e.type === `ArrowFunctionExpression` && (e.body.type === `JSXElement` || e.body.type === `JSXFragment`)) {
		return !0;
	}
	if (e.body === null) return !1;
	let t = !1;
	return Wt(e.body, (e) => {
		if (t || e.type !== `ReturnStatement`) return;
		let { argument: n } = e;
		n !== null && (n.type === `JSXElement` || n.type === `JSXFragment`) && (t = !0);
	}),
		t;
}
function Fr({ parent: e }) {
	return e.type === `CallExpression` || e.type === `JSXExpressionContainer` || e.type === `ArrayExpression`;
}
function Ir(e) {
	if (!(e.parent?.type !== `VariableDeclarator` || e.parent.id.type !== `Identifier`)) return e.parent.id.name;
}
function Lr(e) {
	return e.type === `Identifier` ? e.name : void 0;
}
const Rr = c({
		create(e) {
			let t = 0;
			function n(t, n) {
				e.report({ data: { functionName: n }, messageId: `noRenderHelper`, node: t });
			}
			function r(e) {
				let { parent: r } = e, i = Ir(e);
				if (i !== void 0 && L(i)) {
					--t;
					return;
				}
				if (t > 0 || Fr(e) || r.type !== `VariableDeclarator`) return;
				let a = Lr(r.id);
				if (a === void 0 || L(a) || Ar(a)) return;
				let o = jr(r.id), s = o !== void 0 && Mr(o.typeAnnotation), c = Mr(Nr(e));
				(s || c || Pr(e)) && n(r, a);
			}
			return {
				ArrowFunctionExpression(e) {
					let n = Ir(e);
					n !== void 0 && L(n) && (t += 1);
				},
				"ArrowFunctionExpression:exit": r,
				FunctionDeclaration({ id: e }) {
					e !== null && L(e.name) && (t += 1);
				},
				"FunctionDeclaration:exit"(e) {
					if (e.id === null) return;
					let r = e.id.name;
					if (L(r)) {
						--t;
						return;
					}
					t > 0 || Ar(r) || (Mr(Nr(e)) || Pr(e)) && n(e, r);
				},
				FunctionExpression(e) {
					let n = Ir(e);
					n !== void 0 && L(n) && (t += 1);
				},
				"FunctionExpression:exit": r,
			};
		},
		meta: {
			docs: { description: `Disallow non-component functions that return JSX or React elements.` },
			messages: {
				noRenderHelper:
					`Convert render helper '{{functionName}}' to a React component. Functions that return JSX should be PascalCase components, not camelCase helpers.`,
			},
			schema: [],
			type: `suggestion`,
		},
	}),
	zr = c({
		create(e) {
			return {
				JSXAttribute(t) {
					t.name.type !== `JSXIdentifier` || !t.name.name.startsWith(`_`) ||
						e.report({ data: { propName: t.name.name }, messageId: `noUnderscoreReactProp`, node: t.name });
				},
			};
		},
		meta: {
			docs: { description: `Ban React property names that begin with an underscore in JSX.` },
			messages: {
				noUnderscoreReactProp:
					`React prop '{{propName}}' starts with '_'. Remove the leading underscore from the prop name.`,
			},
			schema: [],
			type: `problem`,
		},
	}),
	Br = new RegExp(
		String.raw`(?:@(?:link|linkcode|linkplain|see)\s+\{?\w+\b\}?)|` +
			String.raw`(?:\{@(?:link|linkcode|linkplain|see)\s+\w+\b\})|` +
			String.raw`(?:[@{](?:type|typedef|param|returns?|template|augments|extends|implements)\s+[^}]*\b\w+\b)`,
		`u`,
	),
	Vr = new RegExp(
		String.raw`(?:@(?:link|linkcode|linkplain|see)\s+\{?(\w+)\b\}?)|` +
			String.raw`(?:\{@(?:link|linkcode|linkplain|see)\s+(\w+)\b\})|` +
			String.raw`(?:[@{](?:type|typedef|param|returns?|template|augments|extends|implements)\s+[^}]*\b(\w+)\b)`,
		`gu`,
	);
function Hr(e) {
	return e.type === `ImportDefaultSpecifier` || e.type === `ImportNamespaceSpecifier` || e.type === `ImportSpecifier`;
}
function Ur(e) {
	let t = new Set();
	for (let n of e) {
		if (!(n.type !== `Block` || !Br.test(n.value))) {
			Vr.lastIndex = 0;
			for (let e of n.value.matchAll(Vr)) {
				let n = e[1] ?? e[2] ?? e[3];
				n !== void 0 && t.add(n);
			}
		}
	}
	return t;
}
const Wr = c({
	create(e) {
		let { sourceCode: t } = e,
			n = e.options[0]?.checkJSDoc ?? !0,
			r = n ? Ur(t.getAllComments()) : new Set(),
			i = [],
			a;
		return {
			ImportDeclaration(e) {
				a ??= e;
				for (let t of e.specifiers) Hr(t) && i.push({ identifierName: t.local.name, parent: e, specifier: t });
			},
			"Program:exit"() {
				if (a === void 0) return;
				let o = t.getScope(a);
				for (let { identifierName: a, parent: s, specifier: c } of i) {
					let i = o.set.get(a);
					i !== void 0 && i.references.length > 0 || n && r.has(a) || e.report({
						data: { identifierName: a },
						fix(e) {
							if (s.specifiers.length === 1) return e.remove(s);
							let n = t.getTokenAfter(c);
							if (s.specifiers[0] === c && n?.value === `,`) {
								let r = t.getTokenBefore(c);
								if (r !== null) {
									return [e.removeRange([r.range[1], c.range[0]]), e.remove(c), e.remove(n)];
								}
							}
							if (n?.value === `,`) return e.removeRange([c.range[0], n.range[1]]);
							let r = t.getTokenBefore(c);
							return r?.value === `,` ? e.removeRange([r.range[0], c.range[1]]) : e.remove(c);
						},
						messageId: `unusedImport`,
						node: c,
					});
				}
			},
		};
	},
	meta: {
		docs: { description: `Disallow unused imports` },
		fixable: `code`,
		messages: { unusedImport: `Import '{{identifierName}}' is defined but never used.` },
		schema: [{
			additionalProperties: !1,
			properties: {
				checkJSDoc: {
					default: !0,
					description: `Check if imports are referenced in JSDoc comments`,
					type: `boolean`,
				},
			},
			type: `object`,
		}],
		type: `problem`,
	},
});
function Gr(e) {
	return e.parent.type === `ExpressionStatement` ?
		!0 :
		e.parent.type !== `UnaryExpression` || e.parent.operator !== `void` ?
		!1 :
		e.parent.parent.type === `ExpressionStatement`;
}
const Kr = c({
	create(e) {
		let t = new Set(), n = new Set(), r = E(rt(e.options[0]));
		return {
			CallExpression(r) {
				oe(r, t, n) && Gr(r) && e.report({ messageId: `unusedUseMemo`, node: r });
			},
			ImportDeclaration(e) {
				if (nt(e, r)) {
					for (let r of e.specifiers) {
						if (r.type === `ImportSpecifier`) {
							ae(r.imported, `useMemo`) && t.add(r.local.name);
							continue;
						}
						n.add(r.local.name);
					}
				}
			},
		};
	},
	meta: {
		docs: { description: `Disallow standalone useMemo calls that ignore the memoized value.`, recommended: !0 },
		messages: {
			unusedUseMemo:
				`useMemo results must be used. Standalone useMemo calls add overhead without preserving a value.`,
		},
		schema: [{
			additionalProperties: !1,
			properties: { environment: { default: `standard`, enum: [`roblox-ts`, `standard`], type: `string` } },
			type: `object`,
		}],
		type: `problem`,
	},
});
function qr(e) {
	if (e.body === null) return;
	if (e.body.type !== `BlockStatement`) return e.body;
	if (e.body.body.length !== 1) return;
	let [t] = e.body.body;
	if (t?.type === `ReturnStatement`) return t.argument ?? void 0;
}
const Jr = c({
		create(e) {
			return {
				CallExpression(t) {
					if (!fr(t, `useMemo`)) return;
					let n = Ht(t);
					if (n === void 0) return;
					let r = qr(n);
					r === void 0 || !R(r) || e.report({ messageId: `simpleMemo`, node: t });
				},
			};
		},
		meta: {
			docs: {
				description: `Disallow useMemo for expressions that are already trivial to compute.`,
				recommended: !0,
			},
			messages: {
				simpleMemo: `useMemo wrapping a trivially cheap expression - memo overhead exceeds the computation`,
			},
			type: `problem`,
		},
	}),
	Yr = [`useEffect`, `useLayoutEffect`, `useInsertionEffect`],
	Xr = [`on`],
	Zr = [`useRef`],
	Qr = [`useState`, `useReducer`];
function $r(e) {
	return e === void 0 ?
		{
			environment: `standard`,
			hooks: new Set(Yr),
			propertyCallbackPrefixes: new Set(Xr),
			refHooks: new Set(Zr),
			reportAdjustState: !0,
			reportDerivedState: !0,
			reportDuplicateDeps: !0,
			reportEffectChain: !0,
			reportEmptyEffect: !0,
			reportEventFlag: !0,
			reportEventSpecificLogic: !0,
			reportExternalStore: !0,
			reportInitializeState: !0,
			reportLogOnly: !0,
			reportMixedDerivedState: !0,
			reportNotifyParent: !0,
			reportPassRefToParent: !0,
			reportResetState: !0,
			stateHooks: new Set(Qr),
		} :
		{
			environment: $e(e.environment) ? e.environment : `standard`,
			hooks: new Set(_(e.hooks) ? e.hooks : Yr),
			propertyCallbackPrefixes: new Set(_(e.propertyCallbackPrefixes) ? e.propertyCallbackPrefixes : Xr),
			refHooks: new Set(_(e.refHooks) ? e.refHooks : Zr),
			reportAdjustState: e.reportAdjustState ?? !0,
			reportDerivedState: e.reportDerivedState ?? !0,
			reportDuplicateDeps: e.reportDuplicateDeps ?? !0,
			reportEffectChain: e.reportEffectChain ?? !0,
			reportEmptyEffect: e.reportEmptyEffect ?? !0,
			reportEventFlag: e.reportEventFlag ?? !0,
			reportEventSpecificLogic: e.reportEventSpecificLogic ?? !0,
			reportExternalStore: e.reportExternalStore ?? !0,
			reportInitializeState: e.reportInitializeState ?? !0,
			reportLogOnly: e.reportLogOnly ?? !0,
			reportMixedDerivedState: e.reportMixedDerivedState ?? !0,
			reportNotifyParent: e.reportNotifyParent ?? !0,
			reportPassRefToParent: e.reportPassRefToParent ?? !0,
			reportResetState: e.reportResetState ?? !0,
			stateHooks: new Set(_(e.stateHooks) ? e.stateHooks : Qr),
		};
}
function ei(e, t, n, r) {
	let { callee: i } = e;
	return i.type === `Identifier` ?
		t.has(i.name) :
		i.type === `MemberExpression` && !i.computed && i.object.type === `Identifier` &&
			i.property.type === `Identifier` ?
		n.has(i.object.name) && r.has(i.property.name) :
		!1;
}
function ti(e) {
	if ((e.type === `FunctionDeclaration` || e.type === `FunctionExpression`) && e.id !== null) return e.id.name;
	let { parent: t } = e;
	if (t.type === `VariableDeclarator` && t.id.type === `Identifier`) return t.id.name;
	if (
		!(`computed` in t) && `key` in t && v(t.key) && t.key.type === `Identifier` ||
		t.type === `MethodDefinition` && t.key.type === `Identifier`
	) return t.key.name;
}
function ni(e) {
	return g(e) && e.startsWith(`use`);
}
function ri(e) {
	if (e.type === `ReturnStatement`) return e.argument === null;
	if (e.type !== `BlockStatement` || e.body.length !== 1) return !1;
	let [t] = e.body;
	return t?.type === `ReturnStatement` && t.argument === null;
}
function ii(e) {
	let t = [...e.body];
	for (; t.length > 0;) {
		let e = t.pop();
		if (e !== void 0) {
			switch (e.type) {
				case `ArrowFunctionExpression`:
				case `FunctionDeclaration`:
				case `FunctionExpression`:
					continue;
				case `ReturnStatement`:
					if (e.argument !== null) return !0;
					continue;
				case `BlockStatement`:
					for (let n of e.body) t.push(n);
					continue;
				case `IfStatement`:
					t.push(e.consequent), e.alternate !== null && t.push(e.alternate);
					continue;
				case `DoWhileStatement`:
				case `ForInStatement`:
				case `ForOfStatement`:
				case `ForStatement`:
				case `LabeledStatement`:
				case `WhileStatement`:
				case `WithStatement`:
					if (e.body.type === `BlockStatement`) { for (let n of e.body.body) t.push(n); }
					else t.push(e.body);
					continue;
				case `SwitchStatement`:
					for (let n of e.cases) for (let e of n.consequent) t.push(e);
					continue;
				case `TryStatement`:
					for (let n of e.block.body) t.push(n);
					if (e.handler !== null) { for (let n of e.handler.body.body) t.push(n); }
					if (e.finalizer !== null) { for (let n of e.finalizer.body) t.push(n); }
					continue;
				default:
					continue;
			}
		}
	}
	return !1;
}
function ai(e) {
	if (e.length === 0) return e;
	let [t] = e;
	return t?.type !== `IfStatement` || t.alternate !== null || !ri(t.consequent) ? e : e.slice(1);
}
function oi(e) {
	return e.type === `ChainExpression` ? e.expression : e;
}
function z(e) {
	if (e.type !== `ExpressionStatement`) return;
	let t = oi(e.expression);
	return t.type === `CallExpression` ? t : void 0;
}
function B(e, t) {
	return e.callee.type === `Identifier` && t.has(e.callee.name);
}
function si(e) {
	return e.type === `Literal` && e.value === !1;
}
function ci(e) {
	return e.type === `Literal` ?
		!0 :
		e.type === `UnaryExpression` && e.operator === `void` && e.argument.type === `Literal` &&
		e.argument.value === 0;
}
function li(e) {
	return e.type === `ArrayExpression` && e.elements.length === 0;
}
function ui(e) {
	return e.type === `ObjectExpression` && e.properties.length === 0;
}
function di(e) {
	if (ci(e)) return !0;
	if (e.type === `Literal`) {
		let { value: t } = e;
		return t === `` || t === 0 || t === !1;
	}
	return li(e) || ui(e);
}
function fi(e, t) {
	let n = z(e);
	if (n?.callee.type !== `Identifier`) return;
	let r = t.get(n.callee.name);
	if (r === void 0 || n.arguments.length !== 1) return;
	let [i] = n.arguments;
	if (!(i === void 0 || !si(i))) return r;
}
function pi(e, t) {
	let n = z(e);
	if (!(n === void 0 || B(n, t))) return n;
}
function mi(e, t) {
	return e.type === `UnaryExpression` && e.operator === `!` && e.argument.type === `Identifier` &&
		e.argument.name === t;
}
function hi(e, t) {
	return e.type === `Identifier` && e.name === t;
}
function V(e) {
	return e.type === `BlockStatement` ? e.body : [e];
}
function gi(e, t, n) {
	if (e.length === 3) {
		let [r, i, a] = e;
		if (r?.type !== `IfStatement` || r.alternate !== null || i === void 0 || a === void 0) return;
		let o = fi(i, t), s = fi(a, t);
		if (o !== void 0 && s === void 0) {
			return !mi(r.test, o) || !ri(r.consequent) || pi(a, n) === void 0 ? void 0 : o;
		}
		if (s !== void 0 && o === void 0) {
			return !mi(r.test, s) || !ri(r.consequent) || pi(i, n) === void 0 ? void 0 : s;
		}
	}
	if (e.length === 1) {
		let [r] = e;
		if (r?.type !== `IfStatement` || r.alternate !== null) return;
		let { test: i } = r, a = V(r.consequent);
		if (a.length !== 2) return;
		let [o, s] = a;
		if (o === void 0 || s === void 0) return;
		let c = fi(o, t), l = fi(s, t);
		if (c !== void 0 && l === void 0) return !hi(i, c) || pi(s, n) === void 0 ? void 0 : c;
		if (l !== void 0 && c === void 0 && hi(i, l) && pi(o, n) !== void 0) return l;
	}
}
function _i(e) {
	let t = [e], n = new Set();
	for (; t.length > 0;) {
		let e = t.pop();
		if (!(e === void 0 || n.has(e))) {
			if (n.add(e), e.type === `Identifier`) return !0;
			if (e.type === `MemberExpression`) {
				t.push(e.object), e.computed || t.push(e.property);
				continue;
			}
			if (e.type === `CallExpression`) {
				t.push(e.callee);
				for (let n of e.arguments) n.type !== `SpreadElement` && t.push(n);
				continue;
			}
			if (e.type === `BinaryExpression` || e.type === `LogicalExpression`) {
				t.push(e.left, e.right);
				continue;
			}
			if (e.type === `UnaryExpression`) {
				t.push(e.argument);
				continue;
			}
			if (e.type === `ConditionalExpression`) {
				t.push(e.test, e.consequent, e.alternate);
				continue;
			}
			if (e.type === `TemplateLiteral`) {
				for (let n of e.expressions) t.push(n);
				continue;
			}
			if (e.type === `ArrayExpression`) {
				for (let n of e.elements) n !== null && n.type !== `SpreadElement` && t.push(n);
				continue;
			}
			if (e.type === `ObjectExpression`) {
				for (let n of e.properties) n.type === `Property` && t.push(n.value);
				continue;
			}
			e.type === `ChainExpression` && t.push(e.expression);
		}
	}
	return !1;
}
function vi(e, t) {
	let n = 0;
	for (let r of e) {
		if (r.type === `IfStatement`) {
			if (r.alternate !== null) return;
			let e = vi(V(r.consequent), t);
			if (e === void 0 || e === 0) return;
			n += e;
			continue;
		}
		let e = z(r);
		if (e === void 0 || !B(e, t) || !e.arguments.some((e) => e.type === `SpreadElement` ? !1 : _i(e))) return;
		n += 1;
	}
	return n > 0 ? n : void 0;
}
function yi(e, t, n) {
	let r = 0;
	for (let i of e) {
		if (i.type === `IfStatement`) {
			if (i.alternate !== null) return;
			let e = yi(V(i.consequent), t, n);
			if (e === void 0 || e === 0) return;
			r += e;
			continue;
		}
		let e = z(i);
		if (e === void 0 || !Ti(e, t, n)) return;
		r += 1;
	}
	return r > 0 ? r : void 0;
}
function bi(e, t) {
	for (let n of t) if (e.startsWith(n)) return !0;
	return !1;
}
function xi(e) {
	let { key: t } = e;
	if (t.type === `Identifier`) return t.name;
	if (t.type === `Literal` && typeof t.value == `string`) return t.value;
}
function Si(e) {
	let { value: t } = e;
	if (t.type === `Identifier`) return t;
	if (t.type === `AssignmentPattern` && t.left.type === `Identifier`) return t.left;
}
function Ci(e) {
	return e.type === `AssignmentPattern` ? e.left : e;
}
function wi(e, t, n, r) {
	let i = { functionId: n, isCustomHook: r, propertyCallbackIdentifiers: new Set(), propertyObjectName: void 0 },
		[a] = e.params;
	if (a === void 0) return i;
	let o = Ci(a);
	if (o.type === `Identifier`) return i.propertyObjectName = o.name, i;
	if (o.type !== `ObjectPattern`) return i;
	for (let e of o.properties) {
		if (e.type !== `Property`) continue;
		let n = xi(e);
		if (n === void 0 || !bi(n, t)) continue;
		let r = Si(e);
		r !== void 0 && i.propertyCallbackIdentifiers.add(r.name);
	}
	return i;
}
function Ti(e, t, n) {
	let { callee: r } = e;
	return r.type === `Identifier` ?
		t.propertyCallbackIdentifiers.has(r.name) :
		r.type === `MemberExpression` && !r.computed && r.object.type === `Identifier` &&
			r.property.type === `Identifier` ?
		t.propertyObjectName !== void 0 && r.object.name === t.propertyObjectName && bi(r.property.name, n) :
		!1;
}
function Ei(e, t) {
	let [, n] = e.arguments;
	if (n?.type !== `ArrayExpression`) return !1;
	for (let e of n.elements) if (e?.type === `Identifier` && e.name === t) return !0;
	return !1;
}
function Di(e) {
	let t = new Set(), [, n] = e.arguments;
	if (n?.type !== `ArrayExpression`) return t;
	for (let e of n.elements) e?.type === `Identifier` && t.add(e.name);
	return t;
}
function Oi(e) {
	let [, t] = e.arguments;
	return t === void 0 ? !0 : t.type === `ArrayExpression` ? t.elements.length === 0 : !1;
}
function ki(e, t) {
	let n = new Set();
	for (let r of e) {
		if (r.type === `IfStatement`) {
			let e = V(r.consequent);
			for (let r of ki(e, t)) n.add(r);
			continue;
		}
		let e = z(r);
		e !== void 0 && B(e, t) && e.callee.type === `Identifier` && n.add(e.callee.name);
	}
	return n;
}
function Ai(e, t, n) {
	for (let r of e) {
		if (r.type === `IfStatement`) {
			if (Ai(V(r.consequent), t, n)) return !0;
			continue;
		}
		let e = z(r);
		if (
			e !== void 0 && !B(e, t) && !(e.callee.type === `Identifier` && n.has(e.callee.name)) &&
			!(e.callee.type === `MemberExpression` && !e.callee.computed && e.callee.object.type === `Identifier` &&
				e.callee.property.type === `Identifier` && n.has(e.callee.object.name))
		) return !0;
	}
	return !1;
}
function ji(e, t) {
	if (e.length === 0) return !1;
	for (let n of e) {
		if (n.type === `IfStatement`) {
			if (n.alternate !== null || !ji(V(n.consequent), t)) return !1;
			continue;
		}
		let e = z(n);
		if (e === void 0 || !B(e, t) || e.arguments.length !== 1) return !1;
		let [r] = e.arguments;
		if (r === void 0 || !di(r)) return !1;
	}
	return !0;
}
function Mi(e, t) {
	if (e.length === 0) return !1;
	for (let n of e) {
		if (n.type === `IfStatement`) {
			if (n.alternate !== null || !Mi(V(n.consequent), t)) return !1;
			continue;
		}
		let e = z(n);
		if (e === void 0 || !B(e, t) || e.arguments.length !== 1) return !1;
		let [r] = e.arguments;
		if (r === void 0 || !(r.type === `Literal` && typeof r.value != `object`) && !(li(r) || ui(r))) return !1;
	}
	return !0;
}
function Ni(e) {
	if (e.length === 0) return !1;
	for (let t of e) {
		if (t.type === `IfStatement`) {
			if (t.alternate !== null || !Ni(V(t.consequent))) return !1;
			continue;
		}
		let e = z(t);
		if (
			e === void 0 ||
			!(e.callee.type === `MemberExpression` && !e.callee.computed && e.callee.object.type === `Identifier` &&
				e.callee.object.name === `console` && e.callee.property.type === `Identifier`)
		) return !1;
	}
	return !0;
}
const Pi = new Set([`addEventListener`, `addListener`, `on`, `subscribe`]);
function Fi(e) {
	return e.some((e) => {
		let t = z(e);
		return t === void 0 ?
			!1 :
			t.callee.type === `MemberExpression` && !t.callee.computed && t.callee.property.type === `Identifier` ?
			Pi.has(t.callee.property.name) :
			!1;
	});
}
function Ii(e, t, n) {
	for (let r of e) {
		if (r.type === `IfStatement`) {
			if (Ii(V(r.consequent), t, n)) return !0;
			continue;
		}
		let e = z(r);
		if (e !== void 0 && e.callee.type === `Identifier` && n.has(e.callee.name)) {
			for (let n of e.arguments) {
				if (
					n.type === `MemberExpression` && !n.computed && n.object.type === `Identifier` &&
					n.property.type === `Identifier` && n.property.name === `current` && t.has(n.object.name)
				) return !0;
			}
		}
	}
	return !1;
}
function Li(e) {
	let t = new Set(), n = new Set(), r = [e];
	for (; r.length > 0;) {
		let e = r.pop();
		if (!(e === void 0 || n.has(e))) {
			if (n.add(e), e.type === `Identifier`) {
				t.add(e.name);
				continue;
			}
			if (e.type === `MemberExpression`) {
				r.push(e.object), e.computed || r.push(e.property);
				continue;
			}
			if (e.type === `CallExpression`) {
				r.push(e.callee);
				for (let t of e.arguments) t.type !== `SpreadElement` && r.push(t);
				continue;
			}
			if (e.type === `BinaryExpression` || e.type === `LogicalExpression`) {
				r.push(e.left, e.right);
				continue;
			}
			if (e.type === `UnaryExpression`) {
				r.push(e.argument);
				continue;
			}
			if (e.type === `ConditionalExpression`) {
				r.push(e.test, e.consequent, e.alternate);
				continue;
			}
			e.type === `ChainExpression` && r.push(e.expression);
		}
	}
	return t;
}
function Ri(e, t, n, r) {
	for (let i of e) {
		if (
			i.type === `IfStatement` &&
			([...Li(i.test)].some((e) => r.has(e) && !n.has(e)) && V(i.consequent).some((e) => {
						let n = z(e);
						return n !== void 0 && B(n, t);
					}) ||
				i.alternate !== null &&
					Ri(i.alternate.type === `BlockStatement` ? i.alternate.body : [i.alternate], t, n, r))
		) return !0;
	}
	return !1;
}
const zi = new Set([
	`alert`,
	`confirm`,
	`display`,
	`hide`,
	`log`,
	`navigate`,
	`notify`,
	`post`,
	`prompt`,
	`redirect`,
	`report`,
	`send`,
	`show`,
	`submit`,
	`track`,
]);
function Bi(e, t, n) {
	for (let r of e) {
		if (
			r.type === `IfStatement` &&
			([...Li(r.test)].filter((e) => n.has(e)).length > 0 && V(r.consequent).some((e) => {
						let n = z(e);
						if (n === void 0 || B(n, t)) return !1;
						if (n.callee.type === `Identifier`) {
							let { name: e } = n.callee;
							for (let t of zi) if (e.toLowerCase().startsWith(t)) return !0;
						}
						if (
							n.callee.type === `MemberExpression` && !n.callee.computed &&
							n.callee.property.type === `Identifier`
						) {
							let e = n.callee.property.name.toLowerCase();
							for (let t of zi) if (e.startsWith(t)) return !0;
						}
						return !1;
					}) ||
				r.alternate !== null &&
					Bi(r.alternate.type === `BlockStatement` ? r.alternate.body : [r.alternate], t, n))
		) return !0;
	}
	return !1;
}
function Vi(e, t) {
	if (e.size !== t.size) return !1;
	for (let n of e) if (!t.has(n)) return !1;
	return !0;
}
function Hi(e, t) {
	return `${e}:${t}`;
}
function Ui(e) {
	if (e.body?.type === `BlockStatement`) return e.body;
}
function Wi(e) {
	return e.body.type === `BlockStatement`;
}
function Gi(e) {
	return e.body !== null;
}
const Ki = new Set(
		`addEventListener.addListener.alert.analytics.cancelAnimationFrame.clearInterval.clearTimeout.confirm.debug.delete.error.fetch.get.info.log.navigate.navigateTo.notify.observe.patch.post.prompt.put.redirect.removeEventListener.removeListener.report.requestAnimationFrame.send.setInterval.setTimeout.showNotification.submit.subscribe.track.unobserve.unsubscribe.warn`
			.split(`.`),
	),
	qi = [`fetch`, `send`, `post`, `track`],
	Ji = new Set([
		`addEventListener`,
		`addListener`,
		`cancelAnimationFrame`,
		`catch`,
		`clearInterval`,
		`clearTimeout`,
		`finally`,
		`observe`,
		`removeEventListener`,
		`removeListener`,
		`requestAnimationFrame`,
		`setInterval`,
		`setTimeout`,
		`subscribe`,
		`then`,
		`unobserve`,
		`unsubscribe`,
	]),
	Yi = [`log`, `fetch`, `send`, `track`, `report`, `show`, `navigate`, `submit`, `post`, `notify`];
function Xi(e, t, n) {
	for (let r of e) {
		if (r.type === `IfStatement`) {
			if (Xi(V(r.consequent), t, n)) return !0;
			continue;
		}
		let e = z(r);
		if (e === void 0) continue;
		let { callee: i } = e;
		if (!(B(e, t) || i.type === `Identifier` && n.has(i.name))) {
			if (i.type === `Identifier`) {
				let { name: e } = i;
				if (Ki.has(e)) return !0;
				for (let t of Yi) if (e.startsWith(t)) return !0;
			}
			if (i.type === `MemberExpression` && !i.computed && i.property.type === `Identifier`) {
				if (i.object.type === `Identifier` && n.has(i.object.name)) continue;
				let e = i.property.name;
				if (
					(e === `log` || e === `warn` || e === `error` || e === `info` || e === `debug`) &&
					i.object.type === `Identifier` && i.object.name === `console`
				) return !0;
				for (let t of qi) if (e.startsWith(t)) return !0;
				if (Ji.has(e)) return !0;
			}
		}
	}
	return !1;
}
const Zi = c({
		create(e) {
			let t = $r(e.options[0]),
				n = E(t.environment),
				r = new Set(),
				i = new Set(),
				a = new Set(),
				o = new Set(),
				s = new Set(),
				c = new Map(),
				l = new Set(),
				u = new Set(),
				d = [],
				f = 1,
				p = new Map(),
				m = [];
			function h(e) {
				return ei(e, i, r, t.hooks);
			}
			function g(e) {
				return ei(e, a, r, t.stateHooks);
			}
			function _(e) {
				return ei(e, l, r, t.refHooks);
			}
			function ee(e) {
				if (e.init?.type !== `CallExpression` || !g(e.init) || e.id.type !== `ArrayPattern`) return;
				let { elements: t } = e.id;
				if (t.length < 2) return;
				let [, n] = t;
				if (n == null || n.type !== `Identifier`) return;
				o.add(n.name);
				let [r] = t;
				r?.type === `Identifier` && (s.add(r.name), c.set(n.name, r.name));
			}
			function te(e) {
				e.init?.type !== `CallExpression` || !_(e.init) || e.id.type !== `Identifier` || u.add(e.id.name);
			}
			function ne(e) {
				e.id.type !== `Identifier` || e.init === null ||
					(e.init.type === `FunctionExpression` || e.init.type === `ArrowFunctionExpression`) &&
						p.set(e.id.name, e.init);
			}
			function v(e) {
				let n = f;
				f += 1;
				let r = ti(e);
				d.push(wi(e, t.propertyCallbackPrefixes, n, ni(r))),
					e.type === `FunctionDeclaration` && e.id !== null && p.set(e.id.name, e);
			}
			function re() {
				d.pop();
			}
			function y(n, r, i) {
				let a = d.at(-1),
					l = ai(r),
					f = Di(n),
					p = ki(r, o),
					h = Ai(r, o, a?.propertyCallbackIdentifiers ?? new Set()),
					g = i !== void 0 && ii(i);
				if (
					m.push({
						depIdentifiers: f,
						hasNonSetterSideEffect: h,
						hasReturnWithCleanup: g,
						node: n,
						ownerFunctionId: a?.functionId ?? 0,
						setterCalls: p,
						statements: r,
					}), t.reportEmptyEffect
				) {
					if (r.length === 0) {
						e.report({ messageId: `emptyEffect`, node: n });
						return;
					}
					let [t] = r;
					if (t !== void 0 && ri(t)) {
						e.report({ messageId: `emptyEffect`, node: n });
						return;
					}
				}
				if (t.reportInitializeState && Oi(n) && Mi(r, o)) {
					e.report({ messageId: `initializeState`, node: n });
					return;
				}
				if (t.reportResetState && ji(r, o) && [...f].some((e) => !s.has(e) && !o.has(e))) {
					e.report({ messageId: `resetState`, node: n });
					return;
				}
				if (t.reportEventFlag) {
					let t = gi(r, c, o);
					if (t !== void 0 && Ei(n, t)) {
						e.report({ messageId: `eventFlag`, node: n });
						return;
					}
				}
				if (t.reportEventSpecificLogic && Bi(r, o, s)) {
					e.report({ messageId: `eventSpecificLogic`, node: n });
					return;
				}
				if (t.reportAdjustState && Ri(r, o, s, f) && !h) {
					e.report({ messageId: `adjustState`, node: n });
					return;
				}
				if (t.reportDerivedState && vi(l, o) !== void 0) {
					e.report({ messageId: `derivedState`, node: n });
					return;
				}
				if (
					t.reportMixedDerivedState && p.size > 0 && h && !g &&
					!Xi(r, o, a?.propertyCallbackIdentifiers ?? new Set())
				) {
					e.report({ messageId: `mixedDerivedState`, node: n });
					return;
				}
				if (t.reportPassRefToParent && a !== void 0 && Ii(r, u, a.propertyCallbackIdentifiers)) {
					e.report({ messageId: `passRefToParent`, node: n });
					return;
				}
				if (
					t.reportNotifyParent && a !== void 0 && !a.isCustomHook &&
					yi(l, a, t.propertyCallbackPrefixes) !== void 0
				) {
					e.report({ messageId: `notifyParent`, node: n });
					return;
				}
				if (t.reportExternalStore && Fi(r) && g) {
					e.report({ messageId: `externalStore`, node: n });
					return;
				}
				t.reportLogOnly && Ni(r) && e.report({ messageId: `logOnly`, node: n });
			}
			function b() {
				if (!t.reportEffectChain) return;
				let n = new Map();
				for (let [e, t] of m.entries()) {
					for (let r of t.setterCalls) {
						let i = c.get(r);
						if (i !== void 0) {
							let r = Hi(t.ownerFunctionId, i), a = n.get(r);
							a === void 0 && (a = new Set(), n.set(r, a)), a.add(e);
						}
					}
				}
				for (let t of m) {
					if (!(t.hasNonSetterSideEffect || t.hasReturnWithCleanup)) {
						for (let r of t.depIdentifiers) {
							let i = Hi(t.ownerFunctionId, r), a = n.get(i);
							if (
								a !== void 0 && a.size > 0 && [...a].every((e) => {
									let t = m[e];
									return t !== void 0 && !t.hasNonSetterSideEffect && !t.hasReturnWithCleanup;
								})
							) {
								e.report({ messageId: `effectChain`, node: t.node });
								return;
							}
						}
					}
				}
			}
			function ie() {
				if (!t.reportDuplicateDeps || m.length < 2) return;
				let n = new Set();
				for (let t = 0; t < m.length; t += 1) {
					if (n.has(t)) continue;
					let r = m[t];
					if (r === void 0 || r.depIdentifiers.size === 0) continue;
					let i = [t];
					for (let e = t + 1; e < m.length; e += 1) {
						if (n.has(e)) continue;
						let t = m[e];
						t !== void 0 && t.ownerFunctionId === r.ownerFunctionId &&
							Vi(r.depIdentifiers, t.depIdentifiers) && i.push(e);
					}
					if (!(i.length < 2)) {
						for (let t of i) {
							n.add(t);
							let r = m[t];
							r !== void 0 && e.report({ messageId: `duplicateDeps`, node: r.node });
						}
					}
				}
			}
			return {
				ArrowFunctionExpression: v,
				"ArrowFunctionExpression:exit": re,
				CallExpression(e) {
					if (!h(e)) return;
					let [t] = e.arguments;
					if (t !== void 0) {
						if (t.type === `Identifier`) {
							let n = p.get(t.name);
							if (n !== void 0) {
								let t = Ui(n);
								if (t !== void 0) {
									if (
										(n.type === `FunctionDeclaration` || n.type === `FunctionExpression`) &&
											n.async || n.type === `ArrowFunctionExpression` && n.async
									) return;
									y(e, t.body.filter((e) => e.type !== `EmptyStatement`), t);
								}
							}
							return;
						}
						if (Me(t)) {
							if (t.type === `ArrowFunctionExpression`) {
								if (t.async || !Wi(t)) return;
								y(e, t.body.body.filter((e) => e.type !== `EmptyStatement`), t.body);
								return;
							}
							t.async || Gi(t) && y(e, t.body.body.filter((e) => e.type !== `EmptyStatement`), t.body);
						}
					}
				},
				FunctionDeclaration: v,
				"FunctionDeclaration:exit": re,
				FunctionExpression: v,
				"FunctionExpression:exit": re,
				ImportDeclaration(e) {
					if (nt(e, n)) {
						for (let n of e.specifiers) {
							if (n.type === `ImportDefaultSpecifier` || n.type === `ImportNamespaceSpecifier`) {
								r.add(n.local.name);
								continue;
							}
							let e = se(n);
							e !== void 0 &&
								(t.hooks.has(e) && i.add(n.local.name),
									t.stateHooks.has(e) && a.add(n.local.name),
									t.refHooks.has(e) && l.add(n.local.name));
						}
					}
				},
				"Program:exit"() {
					b(), ie();
				},
				VariableDeclarator(e) {
					ee(e), te(e), ne(e);
				},
			};
		},
		meta: {
			docs: {
				description:
					`Disallow effects that only derive state, notify parent callbacks, reset state on prop changes, or route event side effects through state.`,
			},
			messages: {
				adjustState:
					`This effect adjusts state when a prop changes. Adjust the state directly during rendering or restructure to avoid this need.`,
				derivedState:
					`This effect only derives state from properties or state. Compute the value during rendering instead of useEffect.`,
				duplicateDeps:
					`Multiple effects have identical dependency arrays. Combine them into a single effect for better performance.`,
				effectChain:
					`This effect is part of a chain of effects that only derive state from other effects. Consolidate the logic into event handlers or compute during rendering.`,
				emptyEffect: `This effect has an empty body and should be removed.`,
				eventFlag:
					`This effect only reacts to a state flag. Call the side effect directly in the event handler instead of toggling state.`,
				eventSpecificLogic:
					`This effect runs event-specific logic based on state. Move this logic to the event handler that triggers the state change.`,
				externalStore:
					"This effect subscribes to an external store and syncs to state. Use `useSyncExternalStore` instead.",
				initializeState:
					`This effect initializes state with a constant value. Pass the value as the useState initializer instead.`,
				logOnly:
					`This effect only contains console.log calls. Remove it (debug leftover) or move the logging to an event handler.`,
				mixedDerivedState:
					`This effect contains state setter calls that derive values from props or state mixed with other operations. Extract the setter calls and compute values during rendering.`,
				notifyParent:
					`This effect only notifies a parent via a property callback. Call the callback in the event handler instead of useEffect.`,
				passRefToParent:
					"This effect passes a ref to a parent callback. Use `forwardRef` or `useImperativeHandle` instead.",
				resetState:
					"This effect resets state when a prop changes. Pass a `key` prop to the component instead to reset all state automatically.",
			},
			schema: [{
				additionalProperties: !1,
				properties: {
					environment: {
						default: `standard`,
						description: `The React environment: 'roblox-ts' uses @rbxts/react, 'standard' uses react.`,
						enum: [`roblox-ts`, `standard`],
						type: `string`,
					},
					hooks: { default: [...Yr], items: { type: `string` }, type: `array` },
					propertyCallbackPrefixes: { default: [...Xr], items: { type: `string` }, type: `array` },
					refHooks: {
						default: [...Zr],
						description: `Ref hook names that return mutable ref objects.`,
						items: { type: `string` },
						type: `array`,
					},
					reportAdjustState: { default: !0, type: `boolean` },
					reportDerivedState: { default: !0, type: `boolean` },
					reportDuplicateDeps: { default: !0, type: `boolean` },
					reportEffectChain: { default: !0, type: `boolean` },
					reportEmptyEffect: { default: !0, type: `boolean` },
					reportEventFlag: { default: !0, type: `boolean` },
					reportEventSpecificLogic: { default: !0, type: `boolean` },
					reportExternalStore: { default: !0, type: `boolean` },
					reportInitializeState: { default: !0, type: `boolean` },
					reportLogOnly: { default: !0, type: `boolean` },
					reportMixedDerivedState: { default: !0, type: `boolean` },
					reportNotifyParent: { default: !0, type: `boolean` },
					reportPassRefToParent: { default: !0, type: `boolean` },
					reportResetState: { default: !0, type: `boolean` },
					stateHooks: {
						default: [...Qr],
						description: `State hook names that return [value, setter] pairs.`,
						items: { type: `string` },
						type: `array`,
					},
				},
				type: `object`,
			}],
			type: `suggestion`,
		},
	}),
	Qi = [
		`Axes`,
		`BrickColor`,
		`CFrame`,
		`Color3`,
		`ColorSequence`,
		`ColorSequenceKeypoint`,
		`DateTime`,
		`Faces`,
		`NumberRange`,
		`NumberSequence`,
		`NumberSequenceKeypoint`,
		`PathWaypoint`,
		`PhysicalProperties`,
		`Ray`,
		`Rect`,
		`Region3`,
		`Region3int16`,
		`TweenInfo`,
		`UDim`,
		`UDim2`,
		`Vector2`,
		`Vector3`,
		`Vector3int16`,
		`Vector3int32`,
	],
	$i = new Set([`!`, `+`, `-`, `typeof`, `void`, `~`]);
function ea(e) {
	return !h(e) || typeof e.dependencyMode != `string` ?
		`non-updating` :
		e.dependencyMode === `empty-or-omitted` || e.dependencyMode === `aggressive` ?
		e.dependencyMode :
		`non-updating`;
}
function ta(e) {
	if (!Array.isArray(e)) return !1;
	for (let t of e) if (typeof t != `string`) return !1;
	return !0;
}
function na(e) {
	let t = h(e) && ta(e.staticGlobalFactories) ? e.staticGlobalFactories : Qi;
	return { dependencyMode: ea(e), environment: rt(e), staticGlobalFactories: new Set(t) };
}
function ra(e, t) {
	let n = e;
	for (; n !== null;) {
		let e = n.set.get(t);
		if (e !== void 0) return e;
		n = n.upper;
	}
}
function ia(e) {
	return e.type === `module` || e.type === `global`;
}
function aa(e) {
	for (let t of e.defs) if (t.type === `ImportBinding`) return !0;
	return !1;
}
function oa(e) {
	return e.type === `Variable`;
}
function sa(e) {
	if (!oa(e)) return;
	let t = e.node;
	if (t.type !== `VariableDeclarator`) return;
	let { parent: n } = t;
	if (!(n.type !== `VariableDeclaration` || n.kind !== `const`)) return t.init ?? void 0;
}
function ca(e, t, n, r) {
	return t.type === `Identifier` ? !0 : ha(t) ? _a(e, t, n, r) : !1;
}
function la(e, t, n, r) {
	let i = f(t);
	return i.type === `Identifier` ?
		pa(e, i, n, r) :
		i.type !== `MemberExpression` || !H(e, i.object, n, r) ?
		!1 :
		i.computed ?
		H(e, i.property, n, r) :
		i.property.type === `Identifier`;
}
function ua(e, { elements: t }, n, r) {
	for (let i of t) if (i === null || i.type === `SpreadElement` || !H(e, i, n, r)) return !1;
	return !0;
}
function da(e) {
	return e.type !== `PrivateIdentifier` && e.type !== `Identifier`;
}
function fa(e, t, n, r) {
	for (let i of t.properties) {
		if (
			i.type !== `Property` || i.kind !== `init` || i.computed && da(i.key) && !H(e, i.key, n, r) ||
			!H(e, i.value, n, r)
		) return !1;
	}
	return !0;
}
function pa(e, t, n, r) {
	let i = ra(e.getScope(t), t.name);
	if (i === void 0) return r.staticGlobalFactories.has(t.name);
	if (!ia(i.scope)) return !1;
	if (aa(i)) return !0;
	for (let t of i.defs) {
		let i = sa(t);
		if (i !== void 0 && H(e, i, n, r)) return !0;
	}
	return !1;
}
const ma = new Set(
	`ArrayExpression.ArrowFunctionExpression.AssignmentExpression.AwaitExpression.BinaryExpression.CallExpression.ChainExpression.ClassExpression.ConditionalExpression.FunctionExpression.Identifier.ImportExpression.Literal.LogicalExpression.MemberExpression.MetaProperty.NewExpression.ObjectExpression.ParenthesizedExpression.SequenceExpression.Super.TaggedTemplateExpression.TemplateLiteral.ThisExpression.TSAsExpression.TSInstantiationExpression.TSNonNullExpression.TSSatisfiesExpression.TSTypeAssertion.UnaryExpression.UpdateExpression.YieldExpression`
		.split(`.`),
);
function ha(e) {
	return ma.has(e.type);
}
function ga(e, t, n, r, i) {
	return !ha(t) || !ha(n) ? !1 : H(e, t, r, i) && H(e, n, r, i);
}
function _a(e, t, n, r) {
	return H(e, t, n, r);
}
function H(e, t, n, r) {
	let i = f(t);
	if (n.has(i)) return !0;
	switch (n.add(i), i.type) {
		case `ArrayExpression`:
			return ua(e, i, n, r);
		case `BinaryExpression`:
		case `LogicalExpression`:
			return ga(e, i.left, i.right, n, r);
		case `CallExpression`:
			return va(e, i.arguments, i.callee, n, r);
		case `ChainExpression`:
			return H(e, i.expression, n, r);
		case `ConditionalExpression`:
			return H(e, i.test, n, r) && H(e, i.consequent, n, r) && H(e, i.alternate, n, r);
		case `Identifier`:
			return pa(e, i, n, r);
		case `Literal`:
			return !0;
		case `MemberExpression`:
			return H(e, i.object, n, r) && (!i.computed || ca(e, i.property, n, r));
		case `NewExpression`:
			return va(e, i.arguments, i.callee, n, r);
		case `ObjectExpression`:
			return fa(e, i, n, r);
		case `SequenceExpression`:
			return i.expressions.length > 0 && i.expressions.every((t) => H(e, t, n, r));
		case `TemplateLiteral`:
			return i.expressions.length === 0;
		case `UnaryExpression`:
			return $i.has(i.operator) && H(e, i.argument, n, r);
		default:
			return !1;
	}
}
function va(e, t, n, r, i) {
	return la(e, n, r, i) ? t.every((t) => t.type !== `SpreadElement` && H(e, t, r, i)) : !1;
}
function ya(e) {
	if (e.body.length !== 1) return;
	let [t] = e.body;
	return t?.type === `ReturnStatement` ? t.argument ?? void 0 : void 0;
}
function ba(e) {
	let [t] = e.arguments;
	if (t === void 0 || t.type !== `ArrowFunctionExpression` && t.type !== `FunctionExpression`) return;
	let { body: n } = t;
	if (n !== null) return n.type === `BlockStatement` ? ya(n) : n;
}
function xa(e, t) {
	switch (t.dependencyMode) {
		case `aggressive`:
			return !0;
		case `empty-or-omitted`:
			return e === 0 || e === 1;
		case `non-updating`:
			return e === 0 || e === 1 || e === 2;
		default: {
			let e = Error(`Unknown dependency mode: ${String(t.dependencyMode)}`);
			throw Error.captureStackTrace(e, xa), e;
		}
	}
}
function Sa(e) {
	return e.parent.type === `ExpressionStatement` ?
		!0 :
		e.parent.type !== `UnaryExpression` || e.parent.operator !== `void` ?
		!1 :
		e.parent.parent.type === `ExpressionStatement`;
}
const Ca = c({
	create(e) {
		let t = na(e.options[0]), n = E(t.environment), r = new Set(), i = new Set();
		return {
			CallExpression(n) {
				if (!oe(n, r, i) || Sa(n) || n.arguments.length === 0) return;
				let a = ba(n);
				if (a === void 0) return;
				let o = new Set();
				H(e.sourceCode, a, o, t) && xa(Kt(e.sourceCode, n.arguments[1], o, t, ua), t) &&
					e.report({ messageId: `uselessUseMemo`, node: n });
			},
			ImportDeclaration(e) {
				if (nt(e, n)) {
					for (let t of e.specifiers) {
						if (t.type === `ImportSpecifier`) {
							ae(t.imported, `useMemo`) && r.add(t.local.name);
							continue;
						}
						i.add(t.local.name);
					}
				}
			},
		};
	},
	meta: {
		docs: { description: `Disallow useMemo calls that only wrap values static enough to live at module scope.` },
		messages: {
			uselessUseMemo:
				`useMemo is wrapping a static value. Move the value to module scope instead of paying hook overhead for no runtime benefit.`,
		},
		schema: [{
			additionalProperties: !1,
			properties: {
				dependencyMode: {
					default: `non-updating`,
					enum: [`empty-or-omitted`, `non-updating`, `aggressive`],
					type: `string`,
				},
				environment: { default: `standard`, enum: [`roblox-ts`, `standard`], type: `string` },
				staticGlobalFactories: { items: { type: `string` }, type: `array` },
			},
			type: `object`,
		}],
		type: `suggestion`,
	},
});
function wa(e) {
	return !e.computed && U(e.value);
}
function U(e) {
	if (e === void 0) return !1;
	switch (e.type) {
		case `ArrayExpression`:
			return e.elements.every((e) => e === null ? !0 : e.type === `SpreadElement` ? !1 : U(e));
		case `CallExpression`:
			return e.callee.type === `MemberExpression` && U(e.callee.object);
		case `Literal`:
			return !0;
		case `MemberExpression`:
			return U(e.object);
		case `ObjectExpression`:
			return e.properties.every((e) => e.type === `SpreadElement` ? !1 : wa(e));
		default:
			return !1;
	}
}
function Ta(e) {
	let t = e;
	for (; t.type === `MemberExpression`;) {
		if (t.computed && !T(t.property)) return !1;
		t = t.object;
	}
	return !0;
}
function Ea(e) {
	return e.type === `MethodDefinition` && e.kind === `constructor` && e.key.type === `Identifier` &&
		e.key.name === `constructor`;
}
const Da = c({
	create(e) {
		let [t = `always`] = e.options;
		return t === `never` ?
			{
				PropertyDefinition(t) {
					t.static || e.report({ messageId: `unexpectedClassProperty`, node: t });
				},
			} :
			{
				ClassDeclaration(t) {
					for (let n of t.body.body) {
						if (!(!Ea(n) || n.value.body === null)) {
							for (let t of n.value.body.body) {
								if (t.type !== `ExpressionStatement`) continue;
								let { expression: n } = t;
								if (n.type !== `AssignmentExpression`) {
									continue;
								}
								let { left: r } = n;
								if (r.type !== `MemberExpression` || r.object.type !== `ThisExpression`) continue;
								let { property: i } = r;
								(i.type === `Identifier` || T(i)) && U(n.right) && Ta(r) &&
									e.report({ messageId: `unexpectedAssignment`, node: n });
							}
						}
					}
				},
				ClassExpression(t) {
					for (let n of t.body.body) {
						if (!(!Ea(n) || n.value.body === null)) {
							for (let t of n.value.body.body) {
								if (t.type !== `ExpressionStatement`) continue;
								let { expression: n } = t;
								if (n.type !== `AssignmentExpression`) {
									continue;
								}
								let { left: r } = n;
								if (r.type !== `MemberExpression` || r.object.type !== `ThisExpression`) continue;
								let { property: i } = r;
								(i.type === `Identifier` || T(i)) && U(n.right) && Ta(r) &&
									e.report({ messageId: `unexpectedAssignment`, node: n });
							}
						}
					}
				},
			};
	},
	meta: {
		docs: { description: `Prefer class properties to assignment of literals in constructors.` },
		messages: {
			unexpectedAssignment:
				`Constructor assigns a literal value to this.property. Literals are static and known at class definition time. Move to a class property declaration: propertyName = value; at class level. This clarifies intent and reduces constructor complexity.`,
			unexpectedClassProperty:
				`Class property declarations are disabled by rule configuration (mode: 'never'). Move initialization into the constructor: this.propertyName = value; inside constructor().`,
		},
		schema: [{ enum: [`always`, `never`], type: `string` }],
		type: `suggestion`,
	},
});
function Oa(e) {
	return !h(e) || typeof e.maximumStatements != `number` ? 1 : e.maximumStatements;
}
function ka(e) {
	return e.type === `IfStatement` && e.alternate === null;
}
function Aa(e, t) {
	return e.type === `ExpressionStatement` && t === 0 || e.type === `BlockStatement` && e.body.length > t;
}
function ja(e, t) {
	if (e.body.length !== 1) return !1;
	let [n] = e.body;
	return n === void 0 || !ka(n) ? !1 : Aa(n.consequent, t);
}
const Ma = c({
	create(e) {
		let t = Oa(e.options[0]);
		function n(n) {
			ja(n, t) && e.report({ messageId: `preferEarlyReturn`, node: n });
		}
		return {
			ArrowFunctionExpression(e) {
				e.body.type === `BlockStatement` && n(e.body);
			},
			FunctionDeclaration(e) {
				e.body !== null && n(e.body);
			},
			FunctionExpression(e) {
				e.body !== null && n(e.body);
			},
		};
	},
	meta: {
		docs: { description: `Prefer early returns over full-body conditional wrapping.`, recommended: !0 },
		messages: {
			preferEarlyReturn:
				`Function body is wrapped in a single conditional without an else branch. This increases nesting depth and cognitive load. Invert the condition and return early: if (!condition) return; then place the main logic at the top level.`,
		},
		schema: [{
			additionalProperties: !1,
			properties: { maximumStatements: { default: 1, minimum: 0, type: `number` } },
			type: `object`,
		}],
		type: `suggestion`,
	},
});
function Na(e) {
	return e.type === `Identifier` && (e.name === `it` || e.name === `test`);
}
function Pa(e) {
	if (e.callee.type !== `MemberExpression` || !Na(e.callee.object)) return !1;
	let t = p(e.callee);
	return t === `only` || t === `skip`;
}
function Fa(e) {
	return e.callee.type !== `MemberExpression` || !Na(e.callee.object) ? !1 : p(e.callee) === `each`;
}
function Ia(e) {
	let t = e.arguments.at(-1);
	return t === void 0 || !Me(t) ? void 0 : t;
}
function La(e) {
	return e.type === `DoWhileStatement` || e.type === `ForInStatement` || e.type === `ForOfStatement` ||
		e.type === `ForStatement` || e.type === `WhileStatement`;
}
function Ra(e, t) {
	return e.type === t.type && e.range[0] === t.range[0] && e.range[1] === t.range[1];
}
function za(e, t) {
	return {
		hasCallback: e.hasCallback || t.hasCallback,
		hasIndeterminate: e.hasIndeterminate || t.hasIndeterminate,
		hasLoop: e.hasLoop || t.hasLoop,
	};
}
function Ba(e, t) {
	if (Ra(e, t)) return { hasCallback: !1, hasIndeterminate: !1, hasLoop: !1 };
	let n = {
		hasCallback: Me(e),
		hasIndeterminate: Me(e) || La(e) || e.type === `ConditionalExpression` || e.type === `IfStatement` ||
			e.type === `SwitchCase` || e.type === `TryStatement`,
		hasLoop: La(e),
	};
	return e.parent === null ? n : za(n, Ba(e.parent, t));
}
function Va(e) {
	return e.callee.type === `Identifier` ?
		Na(e.callee) :
		Pa(e) ?
		!0 :
		e.callee.type === `CallExpression` ?
		Fa(e.callee) :
		!1;
}
function Ha(e) {
	return Va(e) ? Ia(e) : void 0;
}
function Ua(e, t = []) {
	return e.callee.type === `Identifier` && (e.callee.name === `expect` || t.includes(e.callee.name));
}
function Wa({ callee: e }) {
	return e.type !== `MemberExpression` || e.object.type !== `Identifier` || e.object.name !== `expect` ?
		!1 :
		p(e) === `assertions`;
}
function Ga({ callee: e }) {
	return e.type !== `MemberExpression` || e.object.type !== `Identifier` || e.object.name !== `expect` ?
		!1 :
		p(e) === `hasAssertions`;
}
function Ka(e, t = []) {
	let n = 0, r = !1, i = !1, a = !1, o = 0;
	return Ut(e, (s) => {
		if (s.type !== `CallExpression` || !Ua(s, t)) return;
		let c = Ba(s.parent, e);
		if (c.hasLoop && (i = !0), c.hasCallback && (r = !0), c.hasIndeterminate) {
			a = !0, o += 1;
			return;
		}
		n += 1;
	}),
		{ deterministic: n, hasExpectInCallback: r, hasExpectInLoop: i, hasIndeterminate: a, indeterminate: o };
}
function qa(e) {
	return h(e) ?
		{
			additionalExpectCallNames: Array.isArray(e.additionalExpectCallNames) ?
				e.additionalExpectCallNames.filter((e) => typeof e == `string`) :
				[],
			onlyFunctionsWithAsyncKeyword: e.onlyFunctionsWithAsyncKeyword === !0,
			onlyFunctionsWithExpectInCallback: e.onlyFunctionsWithExpectInCallback === !0,
			onlyFunctionsWithExpectInLoop: e.onlyFunctionsWithExpectInLoop === !0,
		} :
		{
			additionalExpectCallNames: [],
			onlyFunctionsWithAsyncKeyword: !1,
			onlyFunctionsWithExpectInCallback: !1,
			onlyFunctionsWithExpectInLoop: !1,
		};
}
function Ja(e) {
	return e.onlyFunctionsWithAsyncKeyword || e.onlyFunctionsWithExpectInCallback || e.onlyFunctionsWithExpectInLoop;
}
function Ya(e) {
	return e.body ?? void 0;
}
function Xa(e) {
	let t = Ya(e);
	return t?.type === `BlockStatement` ? t : void 0;
}
function Za(e, t, n, r, i, a) {
	return n + r === 0 ?
		!1 :
		!Ja(t) || t.onlyFunctionsWithAsyncKeyword && e.async || t.onlyFunctionsWithExpectInCallback && i ||
		t.onlyFunctionsWithExpectInLoop && a;
}
function Qa(e) {
	let t = Xa(e);
	if (t === void 0) return;
	let [n] = t.body;
	if (!(n?.type !== `ExpressionStatement` || n.expression.type !== `CallExpression`)) return n.expression;
}
function $a(e, t, n, r, i) {
	let a = Xa(t);
	if (a === void 0) {
		e.report({ messageId: `haveExpectAssertions`, node: n });
		return;
	}
	let [o] = a.body;
	if (i) {
		e.report({
			messageId: `haveExpectAssertions`,
			node: n,
			suggest: [{
				fix(e) {
					return o === void 0 ?
						e.insertTextAfterRange([a.range[0], a.range[0] + 1], ` expect.hasAssertions();`) :
						e.insertTextBefore(
							o,
							`expect.hasAssertions();
`,
						);
				},
				messageId: `suggestAddingHasAssertions`,
			}],
		});
		return;
	}
	e.report({
		messageId: `haveExpectAssertions`,
		node: n,
		suggest: [{
			data: { count: String(r) },
			fix(e) {
				return o === void 0 ?
					e.insertTextAfterRange([a.range[0], a.range[0] + 1], ` expect.assertions(${r});`) :
					e.insertTextBefore(o, `expect.assertions(${r});\n`);
			},
			messageId: `suggestAddingAssertions`,
		}],
	});
}
function eo(e, t, n, r) {
	if (Ga(t)) {
		t.arguments.length > 0 && e.report({ messageId: `hasAssertionsTakesNoArguments`, node: t });
		return;
	}
	if (!Wa(t)) return;
	if (t.arguments.length !== 1) {
		e.report({ messageId: `assertionsRequiresOneArgument`, node: t });
		return;
	}
	let [i] = t.arguments;
	if (i === void 0 || i.type === `SpreadElement` || !Pe(i)) {
		e.report({ messageId: `assertionsRequiresNumberArgument`, node: t });
		return;
	}
	!r && n > 0 && i.value !== n &&
		e.report({ data: { actual: String(n), expected: String(i.value) }, messageId: `wrongAssertionCount`, node: t });
}
const to = c({
		create(e) {
			let t = qa(e.options[0]);
			return {
				CallExpression(n) {
					if (!Va(n)) return;
					let r = Ha(n);
					if (r === void 0) return;
					let i = Ya(r);
					if (i === void 0) return;
					let {
						deterministic: a,
						indeterminate: o,
						hasIndeterminate: s,
						hasExpectInCallback: c,
						hasExpectInLoop: l,
					} = Ka(i, t.additionalExpectCallNames);
					if (!Za(r, t, a, o, c, l)) return;
					let u = Qa(r);
					if (u !== void 0 && (Wa(u) || Ga(u))) {
						eo(e, u, a, s);
						return;
					}
					$a(e, r, n, a, s);
				},
			};
		},
		meta: {
			docs: { description: `Enforce expect assertion guards in Jest tests.`, recommended: !0 },
			hasSuggestions: !0,
			messages: {
				assertionsRequiresNumberArgument: `This argument should be a number`,
				assertionsRequiresOneArgument: "`expect.assertions` expects a single argument of type number",
				hasAssertionsTakesNoArguments: "`expect.hasAssertions` expects no arguments",
				haveExpectAssertions:
					"Every test should have either `expect.assertions(<number of assertions>)` or `expect.hasAssertions()` as its first expression",
				suggestAddingAssertions: "Add `expect.assertions({{count}})`",
				suggestAddingHasAssertions: "Add `expect.hasAssertions()`",
				wrongAssertionCount: `Expected {{expected}} assertions, but test has {{actual}} expect calls`,
			},
			schema: [{
				additionalProperties: !1,
				properties: {
					additionalExpectCallNames: { items: { type: `string` }, type: `array` },
					onlyFunctionsWithAsyncKeyword: { type: `boolean` },
					onlyFunctionsWithExpectInCallback: { type: `boolean` },
					onlyFunctionsWithExpectInLoop: { type: `boolean` },
				},
				type: `object`,
			}],
			type: `suggestion`,
		},
	}),
	no = /^[A-Z][A-Z0-9_]*$/v;
function ro(e) {
	let { type: t } = e;
	if (t === `module` || t === `global`) return !0;
	if (e.upper?.type === `global`) {
		let { block: t } = e.upper;
		if (t.type === `Program` && t.sourceType === `script`) return !0;
	}
	return !1;
}
const io = c({
		create(e) {
			let t = !1;
			return {
				VariableDeclaration(e) {
					t = e.kind === `const`;
				},
				"VariableDeclaration:exit"() {
					t = !1;
				},
				VariableDeclarator(n) {
					let { id: r } = n;
					if (!(r.type !== `Identifier` || !no.test(r.name))) {
						if (!t) {
							e.report({ messageId: `mustUseConst`, node: n });
							return;
						}
						ro(e.sourceCode.getScope(n)) || e.report({ messageId: `mustBeModuleScope`, node: n });
					}
				},
			};
		},
		meta: {
			docs: {
				description:
					"Prefer that screaming snake case variables always be defined using `const`, and always appear at module scope.",
			},
			messages: {
				mustBeModuleScope:
					`You must place screaming snake case at module scope. If this is not meant to be a module-scoped variable, use camelcase instead.`,
				mustUseConst:
					"You must use `const` when defining screaming snake case variables. If this is not a constant, use camelcase instead.",
			},
			schema: [],
			type: `suggestion`,
		},
	}),
	ao = /[A-Z]+(?![a-z])|[A-Z]?[a-z]+|\d+/gv,
	oo = /^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/gv,
	so = /([a-z0-9])([A-Z])/gv,
	co = /[_\-\s]+/gv;
function lo(e) {
	return e.replaceAll(oo, ``).replaceAll(so, `$1 $2`).replaceAll(co, ` `).match(ao) ?? [];
}
function uo(e) {
	let t = lo(e), n = ``;
	for (let e of t) e.length !== 0 && (n += `${e.slice(0, 1).toUpperCase()}${e.slice(1).toLowerCase()}`);
	return n;
}
const fo = /^\d/u;
function po(e) {
	if (e.id.type === `Identifier`) return e.id.name;
	if (!(e.id.type !== `Literal` || typeof e.id.value != `string`)) return fo.test(e.id.value) ? void 0 : e.id.value;
}
const mo = c({
		create(e) {
			return {
				TSEnumDeclaration(t) {
					let n = t.id.name;
					uo(n) !== n && e.report({ data: { identifier: n }, messageId: `notPascalCase`, node: t.id });
				},
				TSEnumMember(t) {
					let n = po(t);
					n === void 0 || uo(n) === n ||
						e.report({ data: { identifier: n }, messageId: `notPascalCase`, node: t.id });
				},
			};
		},
		meta: {
			docs: { description: `Enforce Pascal case when naming enums.`, recommended: !0 },
			messages: {
				notPascalCase:
					`Enum '{{ identifier }}' uses non-standard casing. TypeScript convention requires PascalCase for enum names and members to distinguish them from variables (camelCase) and constants (UPPER_CASE). Rename to PascalCase: capitalize first letter of each word, no underscores.`,
			},
			schema: [],
			type: `suggestion`,
		},
	}),
	ho = new Set([
		`alumni`,
		`axes`,
		`cacti`,
		`children`,
		`criteria`,
		`data`,
		`dice`,
		`feet`,
		`fungi`,
		`geese`,
		`indices`,
		`matrices`,
		`media`,
		`men`,
		`mice`,
		`octopi`,
		`people`,
		`phenomena`,
		`teeth`,
		`vertices`,
		`women`,
	]),
	go = new Set([
		`alias`,
		`analysis`,
		`axis`,
		`basis`,
		`business`,
		`class`,
		`crisis`,
		`glass`,
		`news`,
		`series`,
		`species`,
		`status`,
		`thesis`,
	]),
	_o = new Set([
		`args`,
		`components`,
		`controllers`,
		`dto`,
		`dtos`,
		`entries`,
		`enums`,
		`hooks`,
		`items`,
		`keys`,
		`models`,
		`options`,
		`orders`,
		`pages`,
		`parameters`,
		`params`,
		`props`,
		`repositories`,
		`services`,
		`settings`,
		`types`,
		`values`,
		`vo`,
		`vos`,
	]),
	vo = /[A-Z]+(?![a-z])|[A-Z]?[a-z]+|\d+/gv,
	yo = /^[A-Z]{2,}[sS]?$/v;
function bo(e) {
	let t = [], n = 0;
	for (let r of e.split(`_`)) {
		let e = r.match(vo);
		if (e !== null) { for (let r of e) t[n++] = r; }
	}
	return t;
}
const xo = /^\d+$/v;
function So(e) {
	for (let t = e.length - 1; t >= 0; --t) {
		let n = e[t];
		if (!(n === void 0 || xo.test(n))) return { lowercased: n.toLowerCase(), original: n };
	}
}
const Co = /[sS]$/v, wo = /(?:ch|sh|x|z)es$/v;
function To(e, t) {
	return ho.has(e) || _o.has(e) ?
		!0 :
		go.has(e) ?
		!1 :
		yo.test(t) && Co.test(t) || e.endsWith(`ies`) || e.endsWith(`ves`) || wo.test(e) ||
		e.endsWith(`s`) && !e.endsWith(`ss`) && !e.endsWith(`us`) && !e.endsWith(`is`);
}
function Eo(e) {
	if (yo.test(e) && Co.test(e)) return !0;
	let t = So(bo(e));
	return t !== void 0 && To(t.lowercased, t.original);
}
const Do = c({
	create(e) {
		return {
			TSEnumDeclaration({ id: t }) {
				let { name: n } = t;
				Eo(n) && e.report({ data: { name: n }, messageId: `notSingular`, node: t });
			},
		};
	},
	meta: {
		docs: { description: `Prefer singular naming for enums.`, recommended: !0 },
		messages: { notSingular: `Enum name "{{name}}" should be singular.` },
		schema: [],
		type: `suggestion`,
	},
});
function Oo(e) {
	return e.type === `JSXElement` || e.type === `JSXFragment`;
}
function ko(e) {
	return e.type !== `PrivateIdentifier`;
}
function Ao(e, t, n) {
	return e.type === `Super` || t.type === `Super` ? e.type === `Super` && t.type === `Super` : G(e, t, n);
}
function jo(e, t, n) {
	return e.type === `SpreadElement` || t.type === `SpreadElement` ?
		e.type !== `SpreadElement` || t.type !== `SpreadElement` ? !1 : G(e.argument, t.argument, n) :
		G(e, t, n);
}
function W(e, t, n) {
	return e.type === `PrivateIdentifier` || t.type === `PrivateIdentifier` ?
		e.type === `PrivateIdentifier` && t.type === `PrivateIdentifier` && e.name === t.name :
		G(e, t, n);
}
function G(e, t, n) {
	let r = f(e), i = f(t);
	if (r.type !== i.type) return !1;
	switch (r.type) {
		case `BinaryExpression`:
			return i.type === `BinaryExpression` && r.operator === i.operator && W(r.left, i.left, n) &&
				W(r.right, i.right, n);
		case `CallExpression`:
			if (
				i.type !== `CallExpression` || r.optional !== i.optional || !Ao(r.callee, i.callee, n) ||
				r.arguments.length !== i.arguments.length
			) return !1;
			for (let e = 0; e < r.arguments.length; e += 1) {
				let t = r.arguments[e], a = i.arguments[e];
				if (!t || !a || !jo(t, a, n)) return !1;
			}
			return !0;
		case `Identifier`:
			return i.type === `Identifier` && r.name === i.name;
		case `Literal`:
			return i.type === `Literal` && r.value === i.value;
		case `LogicalExpression`:
			return i.type === `LogicalExpression` && r.operator === i.operator && G(r.left, i.left, n) &&
				G(r.right, i.right, n);
		case `MemberExpression`:
			return i.type !== `MemberExpression` || r.computed !== i.computed || r.optional !== i.optional ||
					!Ao(r.object, i.object, n) ?
				!1 :
				r.computed ?
				W(r.property, i.property, n) :
				(r.property.type === `Identifier` && i.property.type === `Identifier` ||
					r.property.type === `PrivateIdentifier` && i.property.type === `PrivateIdentifier`) &&
				r.property.name === i.property.name;
		case `ThisExpression`:
			return i.type === `ThisExpression`;
		case `UnaryExpression`:
			return i.type === `UnaryExpression` && r.operator === i.operator && G(r.argument, i.argument, n);
		default:
			return n.getText(r) === n.getText(i);
	}
}
function Mo(e) {
	let t = f(e);
	if (!(t.type !== `UnaryExpression` || t.operator !== `!`)) return f(t.argument);
}
function No(e) {
	let t = f(e);
	if (t.type === `BinaryExpression` && !(t.operator !== `===` && t.operator !== `!==`)) {
		return { left: t.left, operator: t.operator, right: t.right };
	}
}
function Po(e) {
	let t = f(e);
	return t.type === `Identifier` || t.type === `ThisExpression` || t.type === `Literal`;
}
function Fo(e) {
	return ko(e) && Po(e);
}
function Io(e, t, n) {
	let r = Mo(e);
	if (r && G(r, t, n)) return { isFixSafe: Po(r) };
	let i = Mo(t);
	if (i && G(i, e, n)) return { isFixSafe: Po(i) };
	let a = No(e), o = No(t);
	if (!a || !o || !(a.operator === `===` && o.operator === `!==` || a.operator === `!==` && o.operator === `===`)) {
		return;
	}
	let s = W(a.left, o.left, n) && W(a.right, o.right, n), c = W(a.left, o.right, n) && W(a.right, o.left, n);
	if (!(!s && !c)) return { isFixSafe: Fo(a.left) && Fo(a.right) && Fo(o.left) && Fo(o.right) };
}
function Lo(e) {
	return e.type === `JSXText` && e.value.trim() === ``;
}
function Ro(e) {
	if (
		e.type === `JSXExpressionContainer` && e.expression.type !== `JSXEmptyExpression` &&
		e.expression.type === `LogicalExpression` && e.expression.operator === `&&` && Oo(e.expression.right)
	) return { condition: e.expression.left, logical: e.expression, node: e, renderBranch: e.expression.right };
}
const zo = c({
	create(e) {
		let { sourceCode: t } = e;
		function n(n) {
			for (let r = 0; r < n.length; r += 1) {
				let i = n[r];
				if (!i) continue;
				let a = Ro(i);
				if (!a) continue;
				let o = r + 1;
				for (; o < n.length;) {
					let e = n[o];
					if (!e || !Lo(e)) break;
					o += 1;
				}
				if (o >= n.length) continue;
				let s = n[o];
				if (!s) continue;
				let c = Ro(s);
				if (!c) continue;
				let l = Io(a.condition, c.condition, t);
				l && (l.isFixSafe ?
					e.report({
						fix(e) {
							let n = `{${t.getText(a.condition)} ? ${t.getText(a.renderBranch)} : ${
								t.getText(c.renderBranch)
							}}`;
							return e.replaceTextRange([a.node.range[0], c.node.range[1]], n);
						},
						messageId: `preferTernaryConditionalRendering`,
						node: a.logical,
					}) :
					e.report({ messageId: `preferTernaryConditionalRendering`, node: a.logical }),
					r = o);
			}
		}
		return {
			JSXElement(e) {
				n(e.children);
			},
			JSXFragment(e) {
				n(e.children);
			},
		};
	},
	meta: {
		docs: { description: `Prefer ternary expressions over complementary JSX && branches.` },
		fixable: `code`,
		messages: {
			preferTernaryConditionalRendering:
				`Use a single ternary expression instead of complementary JSX && branches.`,
		},
		schema: [],
		type: `suggestion`,
	},
});
function Bo(e, t, n) {
	if (t.type !== `BlockStatement`) return;
	let r = 0;
	for (let e of t.body) {
		if (e.type === `VariableDeclaration`) { for (let t of e.declarations) fr(t.init, `useState`) && (r += 1); }
	}
	r < 5 ||
		e.report({ data: { componentName: n, useStateCount: String(r) }, messageId: `excessiveUseState`, node: t });
}
const Vo = c({
		create(e) {
			return {
				FunctionDeclaration(t) {
					t.id === null || !L(t.id.name) || `body` in t && t.body && Bo(e, t.body, t.id.name);
				},
				VariableDeclarator(t) {
					!pr(t) || !t.init ||
						`body` in t.init && t.init.body && `name` in t.id && Bo(e, t.init.body, t.id.name);
				},
			};
		},
		meta: {
			docs: {
				description: `Suggest using useReducer for related state updates instead of multiple useState calls.`,
				recommended: !0,
			},
			messages: {
				excessiveUseState:
					`Component "{{componentName}}" has {{useStateCount}} useState calls — consider useReducer for related state`,
			},
			type: `problem`,
		},
	}),
	Ho = `replace`,
	Uo = `suggestion`,
	Wo = `A more descriptive name will do too.`,
	Go = { args: `parameters`, char: `character`, dt: `deltaTime`, plr: `player` },
	Ko = [`char`],
	qo = {
		acc: { accumulator: !0 },
		arg: { argument: !0 },
		args: { arguments: !0 },
		arr: { array: !0 },
		attr: { attribute: !0 },
		attrs: { attributes: !0 },
		btn: { button: !0 },
		cb: { callback: !0 },
		char: { character: !0 },
		conf: { config: !0 },
		ctx: { context: !0 },
		cur: { current: !0 },
		curr: { current: !0 },
		db: { database: !0 },
		def: { defer: !0, deferred: !0, define: !0, definition: !0 },
		dest: { destination: !0 },
		dev: { development: !0 },
		dir: { direction: !0, directory: !0 },
		dirs: { directories: !0 },
		dist: { distance: !0 },
		doc: { document: !0 },
		docs: { documentation: !0, documents: !0 },
		dst: { daylightSavingTime: !0, destination: !0, distribution: !0 },
		dt: { dateTime: !0, deltaTime: !0 },
		e: { error: !0, event: !0 },
		el: { element: !0 },
		elem: { element: !0 },
		elems: { elements: !0 },
		env: { environment: !0 },
		envs: { environments: !0 },
		err: { error: !0 },
		ev: { event: !0 },
		evt: { event: !0 },
		ext: { extension: !0 },
		exts: { extensions: !0 },
		fn: { func: !0, function: !0 },
		func: { function: !0 },
		i: { index: !0 },
		idx: { index: !0 },
		impl: { implementation: !0 },
		j: { index: !0 },
		len: { length: !0 },
		lib: { library: !0 },
		mod: { module: !0 },
		msg: { message: !0 },
		num: { number: !0 },
		obj: { object: !0 },
		opts: { options: !0 },
		param: { parameter: !0 },
		params: { parameters: !0 },
		pkg: { package: !0 },
		plr: { player: !0 },
		prev: { previous: !0 },
		prod: { production: !0 },
		prop: { property: !0 },
		props: { properties: !0 },
		rel: { related: !0, relationship: !0, relative: !0 },
		req: { request: !0 },
		res: { resource: !0, response: !0, result: !0 },
		ret: { returnValue: !0 },
		retval: { returnValue: !0 },
		sep: { separator: !0 },
		src: { source: !0 },
		stdDev: { standardDeviation: !0 },
		str: { string: !0 },
		tbl: { table: !0 },
		temp: { temporary: !0 },
		tit: { title: !0 },
		tmp: { temporary: !0 },
		util: { utility: !0 },
		utils: { utilities: !0 },
		val: { value: !0 },
		var: { variable: !0 },
		vars: { variables: !0 },
		ver: { version: !0 },
	},
	Jo = {
		defaultProps: !0,
		devDependencies: !0,
		EmberENV: !0,
		getDerivedStateFromProps: !0,
		getInitialProps: !0,
		getServerSideProps: !0,
		getStaticProps: !0,
		iOS: !0,
		obj: !0,
		propTypes: !0,
		setupFilesAfterEnv: !0,
	},
	Yo = [`i18n`, `l10n`],
	Xo = /(?=[A-Z])|(?<=[_.-])/u,
	Zo = new Set(
		`any.as.boolean.break.case.catch.class.const.constructor.continue.debugger.declare.default.delete.do.else.enum.export.extends.false.finally.for.from.function.get.if.implements.import.in.instanceof.interface.let.module.new.null.number.of.package.private.protected.public.require.return.set.static.string.super.switch.symbol.this.throw.true.try.type.typeof.var.void.while.with.yield`
			.split(`.`),
	),
	Qo = /^[A-Za-z]+$/u;
function $o(e) {
	return e >= 65 && e <= 90 || e >= 97 && e <= 122 || e === 36 || e === 95;
}
function es(e) {
	return e < 192 ?
		$o(e) :
		e >= 12289 && e <= 55295 ?
		!0 :
		e <= 767 ?
		e !== 215 && e !== 247 :
		e <= 8191 ?
		e >= 880 && e !== 894 :
		e <= 8591 ?
		e >= 8204 && e <= 8205 || e >= 8304 :
		e <= 12271 ?
		e >= 11264 :
		e <= 64255 ?
		e >= 63744 :
		e <= 65023 ?
		e >= 64512 :
		e <= 65279 ?
		e >= 65136 :
		e <= 65370 ?
		e >= 65313 && e <= 65338 || e >= 65345 :
		e >= 65382 && e <= 65500;
}
function ts(e) {
	return !!(es(e) || e >= 48 && e <= 57 || e === 8204 || e === 8205 || e >= 768 && e <= 865 ||
		e >= 8240 && e <= 8266);
}
function ns(e) {
	if (e.length === 0 || Zo.has(e)) return !1;
	let t = e.codePointAt(0);
	if (t === void 0 || !es(t)) return !1;
	let n = t > 65535 ? 2 : 1;
	for (; n < e.length;) {
		let t = e.codePointAt(n);
		if (t === void 0 || !ts(t)) return !1;
		n += t > 65535 ? 2 : 1;
	}
	return !0;
}
function rs(e, t) {
	return t === void 0 ? e : { ...e, ...t };
}
const is = /(?<=[a-z])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])|(?<=[a-zA-Z])(?=\d)|(?<=\d)(?=[a-zA-Z])/u,
	as = /[.+^${}()|[\]\\]/gu,
	os = a(`^/(?<first>.+)/(?<second>[gimsuy]*)$`, `v`);
function ss(e) {
	return e === e.toUpperCase();
}
function cs(e) {
	return ss(e.charAt(0));
}
function ls(e) {
	return e.charAt(0).toUpperCase() + e.slice(1);
}
function us(e) {
	return e.charAt(0).toLowerCase() + e.slice(1);
}
function ds(e) {
	return e.split(is);
}
function fs(e) {
	let t = e.match(/\$(\d+)/gu);
	if (t === null) return 0;
	let n = 0;
	for (let e of t) {
		let t = Number.parseInt(e.slice(1), 10);
		t > n && (n = t);
	}
	return n;
}
function ps(e) {
	let t = fs(e);
	if (t === 0) return [];
	let n = Array(t);
	for (let e = 1; e <= t; e += 1) n[e - 1] = RegExp(`\\$${e}`, `gu`);
	return n;
}
function ms(e, t) {
	if (e.startsWith(`/`)) {
		let n = os.exec(e);
		if (n?.groups !== void 0) {
			return {
				matcher: {
					original: e,
					pattern: RegExp(`^${n.groups.first}$`, n.groups.second),
					replacement: t,
					replacementPatterns: ps(t),
				},
				type: `pattern`,
			};
		}
	}
	if (e.includes(`*`) || e.includes(`?`)) {
		let n = e.replaceAll(as, String.raw`\$&`).replaceAll(`*`, `(.*)`).replaceAll(`?`, `(.)`),
			r = 0,
			i = t.replaceAll(`*`, () => `$${++r}`);
		return {
			matcher: { original: e, pattern: RegExp(`^${n}$`, `u`), replacement: i, replacementPatterns: ps(i) },
			type: `pattern`,
		};
	}
	return { original: e, replacement: t, type: `exact` };
}
function hs(e, t) {
	let n = t.exactMatchers.get(e);
	if (n !== void 0) return { matchedWord: e, replacement: n, shorthand: e };
	for (let n of t.matchers) {
		let t = e.match(n.pattern);
		if (t === null) continue;
		let r = n.replacement, i = 1;
		for (let e of n.replacementPatterns) r = r.replaceAll(e, t[i] ?? ``), i += 1;
		return { matchedWord: e, replacement: r, shorthand: n.original };
	}
}
function gs(e, t) {
	if (t.ignoreExact.has(e)) return !0;
	for (let n of t.ignoreMatchers) if (n.pattern.test(e)) return !0;
	return !1;
}
function _s(e, t) {
	return e === `internal` || typeof e == `boolean` ? e : t;
}
function vs(e) {
	if (!h(e)) return;
	let t = {};
	for (let [n, r] of Object.entries(e)) typeof r == `boolean` && (t[n] = r);
	return t;
}
function K(e, t) {
	return typeof e == `boolean` ? e : t;
}
function ys(e) {
	let t = h(e) ? e : void 0, n = vs(t?.allowList), r = K(t?.extendDefaultAllowList, !0) ? rs(Jo, n) : n ?? {};
	return new Map(Object.entries(r));
}
function bs(e) {
	if (!h(e)) return {};
	let t = {};
	for (let [n, r] of Object.entries(e)) {
		if (r === !1) {
			t[n] = !1;
			continue;
		}
		if (!h(r)) continue;
		let e = {};
		for (let [t, n] of Object.entries(r)) typeof n == `boolean` && (e[t] = n);
		t[n] = e;
	}
	return t;
}
function xs(e) {
	let t = h(e) ? e : void 0,
		n = K(t?.extendDefaultReplacements, !0),
		r = bs(t?.replacements),
		i = new Set([...Object.keys(qo), ...Object.keys(r)]),
		a = [];
	for (let e of i) {
		let t = r[e], i = n ? qo[e] ?? {} : {}, o = t === !1 ? {} : rs(i, t);
		a.push([e, new Map(Object.entries(o))]);
	}
	return new Map(a);
}
function Ss(e) {
	let t = h(e) ? e : void 0, n = [];
	for (let e of Yo) n.push(e);
	if (Array.isArray(t?.ignore)) {
		for (let e of t.ignore) {
			(typeof e == `string` || e instanceof RegExp) && n.push(e);
		}
	}
	return n.map((e) => e instanceof RegExp ? e : new RegExp(e, `u`));
}
function Cs(e) {
	let t = h(e) ? e : void 0, n = new Set(Ko);
	if (!_(t?.allowPropertyAccess)) return n;
	for (let e of t.allowPropertyAccess) n.add(e);
	return n;
}
function ws(e) {
	let t = h(e) ? e : void 0,
		n = new Map(),
		r = new Set(),
		i = [],
		a = [],
		o = ee(t?.shorthands) ? t.shorthands : {},
		s = { ...Go, ...o };
	for (let [e, t] of Object.entries(s)) {
		let r = ms(e, t);
		r.type === `exact` ? n.set(r.original, r.replacement) : a.push(r.matcher);
	}
	if (_(t?.ignoreShorthands)) {
		for (let e of t.ignoreShorthands) {
			let t = ms(e, ``);
			t.type === `exact` ? r.add(t.original) : i.push(t.matcher);
		}
	}
	return { exactMatchers: n, ignoreExact: r, ignoreMatchers: i, matchers: a };
}
function Ts(e) {
	let t = h(e) ? e : void 0;
	return {
		allowList: ys(t),
		allowPropertyAccess: Cs(t),
		checkDefaultAndNamespaceImports: _s(t?.checkDefaultAndNamespaceImports, `internal`),
		checkFilenames: K(t?.checkFilenames, !0),
		checkProperties: K(t?.checkProperties, !1),
		checkShorthandImports: _s(t?.checkShorthandImports, `internal`),
		checkShorthandProperties: K(t?.checkShorthandProperties, !0),
		checkVariables: K(t?.checkVariables, !0),
		ignore: Ss(t),
		replacements: xs(t),
		shorthandConfiguration: ws(t),
	};
}
function Es(e, t) {
	if (ss(e) || t.allowList.get(e) === !0) return [];
	let n = t.replacements.get(us(e)) ?? t.replacements.get(e) ?? t.replacements.get(ls(e));
	if (n === void 0) return [];
	let r = cs(e) ? ls : us, i = [...n.keys()].filter((e) => n.get(e) === !0).map(r);
	return i.length > 0 ? i.toSorted() : [];
}
function Ds(e, t) {
	if (e.length === 0) return;
	let n = ds(e), r = [], i = !1;
	for (let e of n) {
		let n = hs(e, t);
		n !== void 0 && (i = !0, r.push(n));
	}
	if (!i) return;
	let a = ``, o = 0;
	for (let e of n) {
		let t = r[o];
		if (t?.matchedWord === e) {
			a += t.replacement, o += 1;
			continue;
		}
		a += e;
	}
	return { matches: r, replaced: a };
}
function Os(e, t) {
	if (gs(e, t)) return !0;
	let n = ds(e), r = !1;
	for (let e of n) {
		let n = hs(e, t);
		if (n !== void 0 && (r = !0, !gs(n.matchedWord, t))) return !1;
	}
	return r;
}
function ks(e, t, n) {
	if (n.has(e)) return !0;
	for (let e of t.matches) if (!n.has(e.matchedWord)) return !1;
	return t.matches.length > 0;
}
function As(e, t, n = 3) {
	if (ss(e) || t.allowList.get(e) === !0 || t.ignore.some((t) => t.test(e))) return { total: 0 };
	let r = Ds(e, t.shorthandConfiguration);
	if (r !== void 0) return Os(e, t.shorthandConfiguration) ? { total: 0 } : { samples: [r.replaced], total: 1 };
	let i = Es(e, t);
	if (i.length > 0) return { samples: i.slice(0, n), total: i.length };
	let a = e.split(Xo).filter(Boolean), o = !1, s = [], c = 0;
	for (let e of a) {
		let n = Es(e, t);
		if (n.length > 0) {
			o = !0, s[c++] = n;
			continue;
		}
		s[c++] = [e];
	}
	if (!o) return { total: 0 };
	let l = s.reduce((e, t) => e * t.length, 1),
		u = Math.min(l, n),
		d = Array.from({ length: u }, (e, t) => {
			let n = t, r = [];
			for (let e = s.length - 1; e >= 0; --e) {
				let t = s[e] ?? [], i = n % t.length;
				n = (n - i) / t.length;
				let a = t[i];
				a !== void 0 && r.unshift(a);
			}
			return r;
		});
	for (let e of d) {
		for (let t = e.length - 1; t > 0; --t) {
			let n = e[t] ?? ``;
			Qo.test(n) && e[t - 1]?.endsWith(n) === !0 && e.splice(t, 1);
		}
	}
	return { samples: d.map((e) => e.join(``)), total: l };
}
function js(e, t) {
	let n = t.replacements.get(e);
	if (n === void 0) return !1;
	for (let e of n.values()) if (e) return !0;
	return !1;
}
function q(e, t, n) {
	let { samples: r = [], total: i } = t;
	if (i === 1) return { data: { discouragedName: e, nameTypeText: n, replacement: r[0] ?? `` }, messageId: Ho };
	let a = r.map((e) => `\`${e}\``).join(`, `), o = i - r.length;
	return o > 0 && (a += `, ... (${o > 99 ? `99+` : o} more omitted)`),
		{ data: { discouragedName: e, nameTypeText: n, replacementsText: a }, messageId: Uo };
}
function Ms(e) {
	let t = [e], n = 1;
	for (let r of e.childScopes) {
		let e = Ms(r);
		for (let r of e) t[n++] = r;
	}
	return t;
}
function Ns(e, t) {
	let n = t;
	for (; n !== null;) {
		let t = n.set.get(e);
		if (t !== void 0) return t;
		n = n.upper;
	}
}
function Ps(e, t) {
	return !t.some((t) => Ns(e, t) !== void 0);
}
function Fs(e, t, n = () => !0) {
	let r = e;
	if (!(!ns(r) && (r = `${r}_`, !ns(r)))) {
		for (; !Ps(r, t) || !n(r, t);) r = `${r}_`;
		return r;
	}
}
function Is(e) {
	let t = new Set();
	for (let n of e.identifiers) t.add(n);
	for (let { identifier: n } of e.references) t.add(n);
	return [...t];
}
function Ls(e, t) {
	return e.range[0] === t.range[0] && e.range[1] === t.range[1];
}
function Rs(e) {
	let { parent: t } = e;
	return !pe(t) || t.local !== e ? !1 : Ls(t.local, t.imported);
}
function zs(e) {
	let { parent: t } = e;
	return !me(t) || t.local !== e ? !1 : Ls(t.local, t.exported);
}
function Bs(e) {
	if (!x(e)) return !1;
	let { parent: t } = e;
	return C(t) && t.shorthand && t.value === e;
}
function Vs(e) {
	if (!x(e)) return !1;
	let { parent: t } = e;
	if (!He(t) || t.left !== e) return !1;
	let n = t.parent;
	return C(n) ? n.shorthand : !1;
}
function Hs(e) {
	if (!x(e)) return !1;
	let { parent: t } = e;
	if (we(t) && t.local === e || Te(t) && t.local === e) return !0;
	if (pe(t) && t.local === e) {
		let { imported: e } = t;
		if (S(e) && e.name === `default`) return !0;
	}
	return b(t) && t.id === e && t.init !== null && We(t.init);
}
function Us(e) {
	if (!x(e)) return !1;
	let { parent: t } = e;
	if (b(t) && t.id === e) {
		let e = t.parent;
		return Ee(e) ? De(e.parent) : !1;
	}
	return Oe(t) && t.id === e || ke(t) && t.id === e || Ae(t) && t.id === e ? De(t.parent) : !1;
}
function Ws(e) {
	return Is(e).every((e) => !Us(e) && !ce(e));
}
function Gs(e, t, n) {
	if (x(e)) {
		return Bs(e) || Vs(e) ?
			n.replaceText(e, `${e.name}: ${t}`) :
			Rs(e) ?
			n.replaceText(e, `${e.name} as ${t}`) :
			zs(e) ?
			n.replaceText(e, `${t} as ${e.name}`) :
			n.replaceText(e, t);
	}
}
function Ks(e, t, n) {
	let r = [], i = 0;
	for (let a of Is(e)) {
		let e = Gs(a, t, n);
		e !== void 0 && (r[i++] = e);
	}
	return r;
}
function qs(e) {
	if (!x(e)) return !1;
	let { parent: t } = e;
	if (w(t) && t.property === e && !t.computed) {
		let e = t.parent;
		if (he(e) && e.left === t) return !0;
	}
	return C(t) && t.key === e && !t.computed && !t.shorthand && xe(t.parent) ||
			me(t) && t.exported === e && t.local !== e ?
		!0 :
		(Se(t) || Ce(t)) && t.key === e && !t.computed;
}
function Js(e) {
	if (!x(e)) return !1;
	let { parent: t } = e;
	return C(t) && t.key === e && !t.computed && !t.shorthand && xe(t.parent);
}
function Ys(e) {
	if (e.type === `ImportBinding`) {
		let { parent: t } = e;
		if (t !== null && ue(t) && de(t.source)) return t.source.value;
	}
	if (e.type === `Variable`) {
		let { node: t } = e;
		if (b(t) && t.init !== null && We(t.init)) {
			let [e] = t.init.arguments;
			if (e !== void 0 && de(e)) return e.value;
		}
	}
}
function Xs(e) {
	let t = Ys(e);
	return t === void 0 ? !1 : !t.includes(`node_modules`) && (t.startsWith(`.`) || t.startsWith(`/`));
}
function Zs(e, t) {
	return e === !1 ? !1 : e === `internal` ? Xs(t) : !0;
}
function Qs(e) {
	return e.defs.length === 1 ? e.defs[0]?.type === `ClassName` : !1;
}
const $s = [{
	additionalProperties: !1,
	properties: {
		allowList: { additionalProperties: { type: `boolean` }, type: `object` },
		allowPropertyAccess: { items: { type: `string` }, type: `array` },
		checkDefaultAndNamespaceImports: { enum: [!1, !0, `internal`] },
		checkFilenames: { type: `boolean` },
		checkProperties: { type: `boolean` },
		checkShorthandImports: { enum: [!1, !0, `internal`] },
		checkShorthandProperties: { type: `boolean` },
		checkVariables: { type: `boolean` },
		extendDefaultAllowList: { type: `boolean` },
		extendDefaultReplacements: { type: `boolean` },
		ignore: { items: { oneOf: [{ type: `object` }, { type: `string` }] }, type: `array` },
		ignoreShorthands: { items: { type: `string` }, type: `array` },
		replacements: {
			additionalProperties: {
				oneOf: [{ enum: [!1] }, { additionalProperties: { type: `boolean` }, type: `object` }],
			},
			type: `object`,
		},
		shorthands: { additionalProperties: { type: `string` }, type: `object` },
	},
	type: `object`,
}];
function ec(e) {
	return function (t, n) {
		return n.every((n) => {
			let r = e.get(n);
			return r === void 0 || !r.has(t);
		});
	};
}
function tc(e) {
	let { parent: t } = e;
	return w(t) && t.property === e && !t.computed || Ne(t) && t.right === e;
}
function nc(e, t, n, r) {
	let i = [];
	i[0] = t, r({ ...q(e.name, { samples: i, total: 1 }, n ? `property` : `variable`), node: e });
}
function rc(e, t, n) {
	return Hs(t) && !Zs(n.checkDefaultAndNamespaceImports, e) || Rs(t) && !Zs(n.checkShorthandImports, e) ?
		!0 :
		!n.checkShorthandProperties && Bs(t);
}
function ic(e) {
	if (e.name !== `plr`) return;
	let [t] = e.defs;
	if (t?.type !== `Variable` || !b(t.node) || t.node.init === null) return;
	let { init: n } = t.node;
	if (
		w(n) && !n.computed && S(n.object) && n.object.name === `Players` && S(n.property) &&
		n.property.name === `LocalPlayer`
	) return `localPlayer`;
}
function ac(e, t, n, r) {
	let i = [], a = 0, o = 0;
	for (let s of e) {
		let e = Fs(s, t, n);
		if (e !== void 0) {
			if (e !== s && js(s, r)) {
				o += 1;
				continue;
			}
			e.length > 0 && (i[a++] = e);
		}
	}
	return { droppedDiscouraged: o, safeSamples: i };
}
function oc(e, t, n) {
	let r = e.type === `Variable` && b(e.node) && e.node.init === null,
		i = e.type === `Parameter` && t.scope.type === `function` && t.scope.block.type === `ArrowFunctionExpression`,
		a = r || i;
	return (e, t) => !(!n(e, t) || a && e === `arguments`);
}
function sc(e, t, n, r, i, a, o) {
	for (let e of i) a.has(e) || a.set(e, new Set()), a.get(e)?.add(r);
	e({
		...t,
		fix(e) {
			return Ks(n, r, e);
		},
		node: o,
	});
}
function cc(e, t, n, r, i) {
	let [a] = e.defs;
	if (a === void 0) return;
	let o = a.name;
	if (!S(o) || rc(a, o, t)) return;
	let s = oc(a, e, r), c = ic(e), l = c === void 0 ? As(e.name, t) : { samples: [c], total: 1 };
	if (l.total === 0 || !l.samples) return;
	let { references: u } = e,
		d = [...u.map((e) => e.from), e.scope],
		{ droppedDiscouraged: f, safeSamples: p } = ac(l.samples, d, s, t),
		m = p.length > 0 ? p : l.samples,
		h = typeof l.samples.length == `number` && l.samples.length === l.total ? Math.max(0, l.total - f) : l.total,
		g = e.name === `fn` && h > 1 ? m.map((e) => e === `function_` ? `function` : e) : m,
		_ = q(o.name, { samples: g, total: h }, `variable`);
	if (h === 1 && p.length === 1 && Ws(e)) {
		let [t] = p;
		if (t !== void 0) {
			sc(i, _, e, t, d, n, o);
			return;
		}
	}
	i({ ..._, node: o });
}
function lc(e, t) {
	if (!Qs(e)) {
		t(e);
		return;
	}
	if (e.scope.type === `class`) {
		let [n] = e.defs;
		if (n === void 0) {
			t(e);
			return;
		}
		let r = n.name;
		if (!S(r)) {
			t(e);
			return;
		}
		t(e);
	}
}
function uc(e, t) {
	for (let n of Ms(e)) for (let e of n.variables) lc(e, t);
}
const dc = c({
		create(e) {
			let t = Ts(e.options[0]), n = e.physicalFilename, r = new WeakMap(), i = ec(r), { sourceCode: a } = e;
			function o(n) {
				cc(n, t, r, i, e.report);
			}
			return {
				Identifier(n) {
					if (!x(n) || n.name === `__proto__`) return;
					let r = Ds(n.name, t.shorthandConfiguration), i = qs(n), a = tc(n);
					if (r !== void 0 && (i || a)) {
						if (
							Os(n.name, t.shorthandConfiguration) || !t.checkShorthandProperties ||
							a && ks(n.name, r, t.allowPropertyAccess)
						) return;
						nc(n, r.replaced, !0, e.report);
						return;
					}
					if (!t.checkProperties) return;
					let o = As(n.name, t);
					if (o.total === 0 || !i) return;
					let s = q(n.name, o, `property`);
					if (o.total === 1 && o.samples && Js(n)) {
						let [t] = o.samples, { parent: r } = n;
						if (t !== void 0 && C(r) && de(r.value) && ns(t)) {
							e.report({
								...s,
								fix(e) {
									return e.replaceText(n, t);
								},
								node: n,
							});
							return;
						}
					}
					e.report({ ...s, node: n });
				},
				JSXOpeningElement({ name: n }) {
					if (!t.checkVariables || !ce(n) || !cs(n.name)) return;
					let r = As(n.name, t);
					if (r.total === 0) return;
					let i = q(n.name, r, `variable`);
					e.report({ ...i, node: n });
				},
				"Program:exit"(r) {
					if (t.checkFilenames && n !== `<input>` && n !== `<text>`) {
						let i = Math.max(n.lastIndexOf(`/`), n.lastIndexOf(`\\`)),
							a = n.slice(i + 1),
							o = a.lastIndexOf(`.`),
							s = o === -1 ? `` : a.slice(o),
							c = As(o === -1 ? a : a.slice(0, o), t);
						if (c.total > 0 && c.samples) {
							let t = c.samples.map((e) => `${e}${s}`);
							e.report({ ...q(a, { samples: t, total: c.total }, `filename`), node: r });
						}
					}
					t.checkVariables && uc(a.getScope(r), o);
				},
			};
		},
		meta: {
			docs: { description: `Prevent abbreviations.`, recommended: !1 },
			fixable: `code`,
			messages: {
				[Ho]: `The {{nameTypeText}} \`{{discouragedName}}\` should be named \`{{replacement}}\`. ${Wo}`,
				[Uo]:
					`Please rename the {{nameTypeText}} \`{{discouragedName}}\`. Suggested names are: {{replacementsText}}. ${Wo}`,
			},
			schema: $s,
			type: `suggestion`,
		},
	}),
	fc = /^use[A-Z0-9].*$/v;
function pc(e) {
	return fc.test(e);
}
function mc(e) {
	if (e.id !== null) return e.id.name;
}
function hc(e) {
	return e.id.type === `Identifier` ? e.id.name : void 0;
}
function gc(e) {
	let t = mc(e);
	return t !== void 0 && pc(t);
}
function _c({ parent: e }) {
	if (e.type !== `VariableDeclarator`) return !1;
	let t = hc(e);
	return t !== void 0 && pc(t);
}
function vc(e, t) {
	let n = e;
	for (; n !== null;) {
		let e = n.set.get(t);
		if (e !== void 0) return e;
		n = n.upper;
	}
}
function yc(e, t) {
	let n = e.get(t);
	if (!(n === void 0 || n.length === 0)) return n.at(-1);
}
function bc(e) {
	for (let t = e.defs.length - 1; t >= 0; --t) {
		let n = e.defs[t];
		if (!(n?.node.type !== `VariableDeclarator` || n.node.init?.type !== `ArrayExpression`)) return n.node.init;
	}
}
function xc(e) {
	for (let t = e.defs.length - 1; t >= 0; --t) {
		let n = e.defs[t];
		if (n?.node.type === `VariableDeclarator` && n.node.init?.type === `ObjectExpression`) return !0;
	}
	return !1;
}
function Sc(e, t, n, r) {
	let i = vc(e.getScope(t), n);
	if (i !== void 0) {
		let e = bc(i);
		if (e !== void 0) return e;
	}
	return yc(r, n);
}
function Cc(e, t, n) {
	if (e.argument.type === `Identifier`) {
		let r = Sc(t, e, e.argument.name, n);
		return r === void 0 ? 1 : wc(r, t, n);
	}
	return e.argument.type === `ArrayExpression` ? wc(e.argument, t, n) : 1;
}
function wc(e, t, n) {
	let r = 0;
	for (let i of e.elements) {
		if (i === null) {
			r += 1;
			continue;
		}
		if (i.type === `SpreadElement`) {
			r += Cc(i, t, n);
			continue;
		}
		r += 1;
	}
	return r;
}
function Tc(e, t) {
	let n = vc(e.getScope(t), t.name);
	return n === void 0 ? !1 : xc(n);
}
function Ec(e, t) {
	let n = hc(e);
	if (n === void 0 || e.init?.type !== `ArrayExpression`) return;
	let r = t.get(n) ?? [];
	r.push(e.init), t.set(n, r);
}
function Dc(e, t) {
	let n = hc(e);
	if (n === void 0 || e.init?.type !== `ArrayExpression`) return;
	let r = t.get(n);
	r === void 0 || r.length === 0 || (r.pop(), r.length === 0 && t.delete(n));
}
const Oc = c({
	create(e) {
		let { sourceCode: t } = e, n = new Map(), r = 0;
		function i(e) {
			gc(e) && (r += 1);
		}
		function a(e) {
			gc(e) && --r;
		}
		function o(e) {
			_c(e) && (r += 1);
		}
		function s(e) {
			_c(e) && --r;
		}
		function c(t) {
			e.report({ data: { count: `2` }, messageId: `tooManyReturnValues`, node: t });
		}
		function l(e) {
			if (!(r === 0 || e.argument === null || e.argument.type === `ObjectExpression`)) {
				if (e.argument.type === `Identifier`) {
					if (Tc(t, e.argument)) return;
					let r = Sc(t, e, e.argument.name, n);
					if (r === void 0) return;
					wc(r, t, n) > 2 && c(e);
					return;
				}
				e.argument.type === `ArrayExpression` && wc(e.argument, t, n) > 2 && c(e);
			}
		}
		return {
			ArrowFunctionExpression: o,
			"ArrowFunctionExpression:exit": s,
			FunctionDeclaration: i,
			"FunctionDeclaration:exit": a,
			FunctionExpression: i,
			"FunctionExpression:exit": a,
			ReturnStatement: l,
			VariableDeclarator(e) {
				Ec(e, n);
			},
			"VariableDeclarator:exit"(e) {
				Dc(e, n);
			},
		};
	},
	meta: {
		docs: { description: `Restrict React hooks to object returns or short tuples.` },
		messages: {
			tooManyReturnValues:
				`Hook returns more than {{count}} values. Return an object with named properties instead.`,
		},
		schema: [],
		type: `suggestion`,
	},
});
function kc(e) {
	return e.endsWith(`Async`);
}
function Ac(e, t) {
	kc(t.name) || e.report({ messageId: `missingAsyncSuffix`, node: t });
}
function jc(e, t) {
	t.id.type === `Identifier` &&
		(t.init?.type !== `ArrowFunctionExpression` && t.init?.type !== `FunctionExpression` ||
			t.init.async && Ac(e, t.id));
}
function Mc(e, t) {
	!t.value.async || t.key.type !== `Identifier` || Ac(e, t.key);
}
const Nc = c({
	create(e) {
		return {
			FunctionDeclaration(t) {
				!t.async || t.id === null || Ac(e, t.id);
			},
			MethodDefinition(t) {
				Mc(e, t);
			},
			Property(t) {
				!t.method || t.value.type !== `FunctionExpression` || !t.value.async ||
					t.key.type === `Identifier` && Ac(e, t.key);
			},
			PropertyDefinition(t) {
				t.value?.type !== `ArrowFunctionExpression` && t.value?.type !== `FunctionExpression` ||
					!t.value.async || t.key.type !== `Identifier` || Ac(e, t.key);
			},
			VariableDeclarator(t) {
				jc(e, t);
			},
		};
	},
	meta: {
		docs: { description: `Require async function names to end with Async.` },
		messages: { missingAsyncSuffix: `Async functions must have names that end with Async.` },
		schema: [],
		type: `problem`,
	},
});
function Pc(e) {
	if (!h(e) || !(`classes` in e) || !h(e.classes)) return new Map();
	let { classes: t } = e, n = new Map();
	for (let [e, r] of Object.entries(t)) typeof r == `string` && n.set(e, r);
	return n;
}
function Fc(e) {
	return e?.type === `module` || e?.type === `global`;
}
function Ic(e) {
	if (e.type === `ImportDefaultSpecifier`) return e.local.name;
	if (e.type === `ImportSpecifier`) {
		if (e.imported.type === `Identifier`) return e.imported.name;
		if (typeof e.imported.value == `string`) return e.imported.value;
	}
}
function Lc(e, t, n) {
	if (e.callee.type === `Identifier`) {
		let r = t.get(e.callee.name);
		if (r === void 0) return;
		let i = n.get(r);
		return i === void 0 ? void 0 : { className: r, importSource: i };
	}
	if (e.callee.type === `MemberExpression` && e.callee.property.type === `Identifier`) {
		let t = e.callee.property.name, r = n.get(t);
		return r === void 0 ? void 0 : { className: t, importSource: r };
	}
}
function Rc(e, t, n) {
	if (typeof e.source.value != `string`) return;
	let r = e.source.value;
	for (let [i, a] of t) if (a === r) { for (let t of e.specifiers) Ic(t) === i && n.set(t.local.name, i); }
}
const zc = c({
		create(e) {
			let { sourceCode: t } = e, n = Pc(e.options[0]);
			if (n.size === 0) return {};
			let r = new Map();
			return {
				ImportDeclaration(e) {
					Rc(e, n, r);
				},
				NewExpression(i) {
					let a = Lc(i, r, n);
					a !== void 0 &&
						(Fc(t.getScope(i)) ||
							e.report({
								data: { className: a.className, importSource: a.importSource },
								messageId: `mustBeModuleLevel`,
								node: i,
							}));
				},
			};
		},
		meta: {
			docs: { description: `Require configured classes to be instantiated at module level only.` },
			messages: {
				mustBeModuleLevel: `'{{className}}' from '{{importSource}}' must be instantiated at module level only.`,
			},
			schema: [{
				additionalProperties: !1,
				properties: { classes: { additionalProperties: { type: `string` }, type: `object` } },
				type: `object`,
			}],
			type: `problem`,
		},
	}),
	Bc = [{ allowAsync: !1, name: `useEffect` }, { allowAsync: !1, name: `useLayoutEffect` }, {
		allowAsync: !1,
		name: `useInsertionEffect`,
	}];
function Vc(e) {
	return h(e) && typeof e.name == `string` && typeof e.allowAsync == `boolean`;
}
function Hc(e) {
	if (!h(e)) return { environment: `standard`, hooks: Bc };
	let t = $e(e.environment) ? e.environment : `standard`, n = e.hooks;
	if (!Array.isArray(n)) return { environment: t, hooks: Bc };
	let r = [];
	for (let e of n) Vc(e) && r.push(e);
	return r.length === 0 ? { environment: t, hooks: Bc } : { environment: t, hooks: r };
}
function Uc(e, t) {
	let n = e;
	for (; n !== null;) {
		let e = n.set.get(t);
		if (e !== void 0) return e;
		n = n.upper;
	}
}
function Wc(e) {
	for (let t of e.defs) {
		let { node: e } = t;
		if (e.type === `FunctionDeclaration`) return { isAsync: e.async, node: e, type: `function-declaration` };
		if (e.type === `VariableDeclarator`) {
			if (e.init === null) continue;
			if (e.init.type === `ArrowFunctionExpression`) {
				return { isAsync: e.init.async, node: e.init, type: `arrow` };
			}
			if (e.init.type === `FunctionExpression`) {
				return { isAsync: e.init.async, node: e.init, type: `function-expression` };
			}
		}
	}
}
function Gc(e, t) {
	let n = Uc(e.getScope(t), t.name);
	if (n === void 0) return !1;
	for (let e of n.defs) {
		let { node: t } = e;
		if (t.type !== `VariableDeclarator` || t.init?.type !== `CallExpression`) continue;
		let n = k(t.init);
		if (n === `useCallback` || n === `useMemo`) return !0;
	}
	return !1;
}
const Kc = c({
		create(e) {
			let { environment: t, hooks: n } = Hc(e.options[0]),
				r = new Map(n.map((e) => [e.name, e.allowAsync])),
				i = new Set(r.keys()),
				a = t === `roblox-ts`;
			function o(e) {
				let t = r.get(e);
				return typeof t == `boolean` ? t : !1;
			}
			return {
				CallExpression(t) {
					let n = k(t);
					if (n === void 0 || !i.has(n)) return;
					let [r] = t.arguments;
					if (r !== void 0) {
						if (r.type === `Identifier`) {
							let i = Uc(e.sourceCode.getScope(r), r.name);
							if (i === void 0) {
								Gc(e.sourceCode, r) &&
									e.report({ data: { hook: n }, messageId: `identifierReferencesCallback`, node: t });
								return;
							}
							let s = Wc(i);
							if (s === void 0) {
								Gc(e.sourceCode, r) &&
									e.report({ data: { hook: n }, messageId: `identifierReferencesCallback`, node: t });
								return;
							}
							s.type === `arrow` ?
								s.isAsync ?
									o(n) ||
									e.report({
										data: { hook: n },
										messageId: `identifierReferencesAsyncArrow`,
										node: t,
									}) :
									e.report({ data: { hook: n }, messageId: `identifierReferencesArrow`, node: t }) :
								s.type === `function-expression` ?
								s.node.id === null ?
									e.report({ data: { hook: n }, messageId: `anonymousFunction`, node: t }) :
									a && e.report({ data: { hook: n }, messageId: `functionExpression`, node: t }) :
								s.isAsync && !o(n) &&
								e.report({
									data: { hook: n },
									messageId: `identifierReferencesAsyncFunction`,
									node: t,
								});
							return;
						}
						if (r.type === `ArrowFunctionExpression`) {
							r.async ?
								e.report({ data: { hook: n }, messageId: `asyncArrowFunction`, node: t }) :
								e.report({ data: { hook: n }, messageId: `arrowFunction`, node: t });
							return;
						}
						if (r.type === `FunctionExpression`) {
							let i = r.id !== null;
							i && r.async ?
								e.report({ data: { hook: n }, messageId: `asyncFunctionExpression`, node: t }) :
								i && a ?
								e.report({ data: { hook: n }, messageId: `functionExpression`, node: t }) :
								!i && r.async ?
								e.report({ data: { hook: n }, messageId: `asyncAnonymousFunction`, node: t }) :
								i || e.report({ data: { hook: n }, messageId: `anonymousFunction`, node: t });
						}
					}
				},
			};
		},
		meta: {
			docs: {
				description:
					`Enforce named effect functions for better debuggability. Prevents inline arrow functions in useEffect and similar hooks.`,
				recommended: !1,
			},
			messages: {
				anonymousFunction:
					`Anonymous function passed to {{hook}}. debug.info returns empty string for anonymous functions, making stack traces useless for debugging. Extract to: function effectName() { ... } then pass effectName.`,
				arrowFunction:
					`Arrow function passed to {{hook}}. Arrow functions have no debug name and create new instances each render. Extract to: function effectName() { ... } then pass effectName.`,
				asyncAnonymousFunction:
					`Async anonymous function in {{hook}}. Two issues: (1) no debug name makes stack traces useless, (2) async effects require cancellation logic for unmount. Extract to: async function effectName() { ... } with cleanup.`,
				asyncArrowFunction:
					`Async arrow function in {{hook}}. Two issues: (1) arrow functions have no debug name, (2) async effects require cancellation logic. Extract to: async function effectName() { ... } with cleanup.`,
				asyncFunctionDeclaration:
					`Async function declaration passed to {{hook}}. Async effects require cancellation logic to handle component unmount. Implement cleanup or set allowAsync: true if cancellation is handled.`,
				asyncFunctionExpression:
					`Async function expression in {{hook}}. Async effects require cancellation logic for unmount. Extract to a named async function declaration with cleanup, then pass the reference.`,
				functionExpression:
					`Function expression passed to {{hook}}. Function expressions create new instances each render, breaking referential equality. Extract to: function effectName() { ... } at module or component top-level.`,
				identifierReferencesArrow:
					`{{hook}} receives identifier pointing to arrow function. Arrow functions have no debug name and lack referential stability. Convert to: function effectName() { ... } then pass effectName.`,
				identifierReferencesAsyncArrow:
					`{{hook}} receives identifier pointing to async arrow function. Two issues: (1) no debug name, (2) async effects require cancellation logic. Convert to: async function effectName() { ... } with cleanup.`,
				identifierReferencesAsyncFunction:
					`{{hook}} receives identifier pointing to async function. Async effects require cancellation logic for unmount. Implement cleanup or set allowAsync: true if cancellation is handled.`,
				identifierReferencesCallback:
					`{{hook}} receives identifier from useCallback/useMemo. These hooks return new references when dependencies change, causing unexpected effect re-runs. Use a stable function declaration: function effectName() { ... }`,
			},
			schema: [{
				additionalProperties: !1,
				properties: {
					environment: {
						default: `standard`,
						description:
							`Environment mode: 'roblox-ts' only allows identifiers, 'standard' allows both identifiers and named function expressions`,
						enum: [`roblox-ts`, `standard`],
						type: `string`,
					},
					hooks: {
						description: `Array of hook configuration objects with name and allowAsync settings`,
						items: {
							additionalProperties: !1,
							properties: {
								allowAsync: {
									description: `Whether async functions are allowed for this hook`,
									type: `boolean`,
								},
								name: { description: `Hook name to check`, type: `string` },
							},
							required: [`name`, `allowAsync`],
							type: `object`,
						},
						type: `array`,
					},
				},
				type: `object`,
			}],
			type: `problem`,
		},
	}),
	qc = {
		allowRootKeys: !1,
		ignoreCallExpressions: [`ReactTree.mount`, `CreateReactStory`, `createReactStory`, `createPlatformStory`],
		iterationMethods: [
			`map`,
			`filter`,
			`forEach`,
			`flatMap`,
			`reduce`,
			`reduceRight`,
			`some`,
			`every`,
			`find`,
			`findIndex`,
		],
		memoizationHooks: [`useCallback`, `useMemo`],
	},
	Jc = new Set([
		`ChainExpression`,
		`ParenthesizedExpression`,
		`TSAsExpression`,
		`TSInstantiationExpression`,
		`TSNonNullExpression`,
		`TSSatisfiesExpression`,
		`TSTypeAssertion`,
	]),
	Yc = new Set([
		...Jc,
		`AwaitExpression`,
		`ConditionalExpression`,
		`LogicalExpression`,
		`SequenceExpression`,
		`SpreadElement`,
	]),
	J = { iteration: !1, memoization: !1 },
	Xc = new Set([`ConditionalExpression`, `LogicalExpression`]),
	Zc = new Set([`ArrowFunctionExpression`, `FunctionExpression`]),
	Qc = new Set([
		`BlockStatement`,
		`CatchClause`,
		`DoWhileStatement`,
		`ForInStatement`,
		`ForOfStatement`,
		`ForStatement`,
		`IfStatement`,
		`LabeledStatement`,
		`SwitchCase`,
		`SwitchStatement`,
		`TryStatement`,
		`WhileStatement`,
		`WithStatement`,
	]);
function Y(e) {
	return e.parent ?? void 0;
}
function X(e) {
	let t = e;
	for (; t !== void 0 && Jc.has(t.type);) t = Y(t);
	return t;
}
function $c(e) {
	for (let t of e.openingElement.attributes) if (t.type === `JSXAttribute` && t.name.name === `key`) return !0;
	return !1;
}
function el({ callee: e }) {
	return e.type === `Identifier` ?
		e.name === `forwardRef` || e.name === `memo` :
		e.type === `MemberExpression` && e.object.type === `Identifier` && e.object.name === `React` &&
			e.property.type === `Identifier` ?
		e.property.name === `forwardRef` || e.property.name === `memo` :
		!1;
}
function tl(e) {
	return e.type === `ArrowFunctionExpression` || e.type === `FunctionExpression` || e.type === `FunctionDeclaration`;
}
function nl(e) {
	let t = Y(e);
	for (; t !== void 0;) {
		if (tl(t)) return t;
		t = Y(t);
	}
}
function rl(e, t, n) {
	let { callee: r } = e;
	if (r.type === `Identifier`) return { iteration: t.has(r.name), memoization: n.has(r.name) };
	if (r.type === `MemberExpression` && r.property.type === `Identifier`) {
		let { name: i } = r.property, a = { iteration: t.has(i), memoization: n.has(i) };
		return i === `from` && r.object.type === `MemberExpression` && r.object.object.type === `Identifier` &&
					r.object.object.name === `Array` && e.arguments.length >= 2 ||
				i === `call` && r.object.type === `MemberExpression` && r.object.object.type === `MemberExpression` &&
					r.object.object.property.type === `Identifier` && t.has(r.object.object.property.name) ?
			{ ...a, iteration: !0 } :
			a;
	}
	return J;
}
function il(e) {
	let t = e, n = Y(e);
	for (; n !== void 0;) {
		if (n.type === `CallExpression`) {
			for (let e of n.arguments) if (e === t || e.type === `SpreadElement` && e.argument === t) return n;
			return;
		}
		if (Yc.has(n.type)) {
			t = n, n = Y(n);
			continue;
		}
		break;
	}
}
function al(e, t) {
	if (t.type === `FunctionDeclaration`) {
		let n = e.getDeclaredVariables(t);
		return n.length > 0 ? n[0] : void 0;
	}
	let n = Y(t);
	if (n !== void 0 && (n.type === `VariableDeclarator` || n.type === `AssignmentExpression`)) {
		let t = e.getDeclaredVariables(n);
		if (t.length > 0) return t[0];
	}
}
function ol(e, t) {
	e.iteration ||= t.iteration, e.memoization ||= t.memoization;
}
function sl(e, t, n) {
	if (e.isWrite()) return J;
	let r = il(e.identifier);
	return r === void 0 || el(r) ? J : rl(r, t, n);
}
function cl(e, t, n, r) {
	let i = il(t);
	if (i !== void 0) return el(i) ? J : rl(i, n, r);
	let a = al(e, t);
	if (a === void 0) return J;
	let o = { iteration: !1, memoization: !1 };
	for (let e of a.references) if (ol(o, sl(e, n, r)), o.iteration && o.memoization) return o;
	return o;
}
function ll(e) {
	let t = X(Y(e));
	if (t === void 0 || t.type === `JSXExpressionContainer` && (t = X(Y(t)), t === void 0)) return !1;
	for (; t !== void 0 && Xc.has(t.type);) t = X(Y(t));
	if (t === void 0 || t.type === `JSXExpressionContainer` && (t = X(Y(t)), t === void 0)) return !1;
	if (t.type === `ReturnStatement`) {
		let e = X(Y(t));
		for (; e !== void 0 && Qc.has(e.type);) e = X(Y(e));
		return e === void 0 ? !1 : Zc.has(e.type) || e.type === `FunctionDeclaration`;
	}
	return t.type === `ArrowFunctionExpression`;
}
function ul(e) {
	if (!ll(e)) return !1;
	let t = nl(e);
	if (t === void 0) return !1;
	let n = X(Y(t));
	return n?.type === `CallExpression` ? el(n) : !0;
}
function dl(e, t) {
	let n = Y(e);
	if (n === void 0 || n.type === `JSXExpressionContainer` && (n = Y(n), n === void 0)) return !1;
	for (let e = 0; e < 20 && n !== void 0; e += 1) {
		if (n.type === `CallExpression`) {
			let { callee: e } = n;
			return e.type === `Identifier` ?
				t.includes(e.name) :
				e.type === `MemberExpression` && e.object.type === `Identifier` && e.property.type === `Identifier` ?
				t.includes(`${e.object.name}.${e.property.name}`) :
				!1;
		}
		n = Y(n);
	}
	return !1;
}
function fl({ name: e }) {
	return e.type === `JSXIdentifier` ? e.name : e.name.name;
}
function pl(e) {
	return e.toLowerCase().endsWith(`children`);
}
function ml(e) {
	let t = Y(e);
	if (t === void 0) return !1;
	for (; t !== void 0 && (t.type === `ConditionalExpression` || t.type === `LogicalExpression`);) t = Y(t);
	if (t === void 0 || t.type === `JSXExpressionContainer` && (t = Y(t), t === void 0) || t.type !== `JSXAttribute`) {
		return !1;
	}
	let n = fl(t);
	return n === void 0 ? !0 : !pl(n);
}
function hl(e) {
	let t = e, n = Y(e);
	for (; n !== void 0 && Jc.has(n.type);) t = n, n = Y(n);
	return n === void 0 ?
		!1 :
		n.type === `VariableDeclarator` ?
		n.init === t :
		n.type === `AssignmentExpression` ?
		n.right === t :
		!1;
}
function gl(e) {
	let t = Y(e);
	if (t === void 0) return !1;
	let n = !1;
	for (; t !== void 0 && (t.type === `ConditionalExpression` || Jc.has(t.type));) {
		t.type === `ConditionalExpression` && (n = !0), t = Y(t);
	}
	if (!n || t?.type !== `JSXExpressionContainer`) return !1;
	let r = Y(t);
	return r === void 0 ? !1 : r.type === `JSXElement` || r.type === `JSXFragment`;
}
function _l(e) {
	let t = Y(e);
	if (t === void 0) return !1;
	let n = !1;
	for (; t !== void 0 && (t.type === `LogicalExpression` || Jc.has(t.type));) {
		t.type === `LogicalExpression` && (n = !0), t = Y(t);
	}
	if (!n || t?.type !== `JSXExpressionContainer`) return !1;
	let r = Y(t);
	return r === void 0 ? !1 : r.type === `JSXElement` || r.type === `JSXFragment`;
}
const vl = c({
	create(e) {
		let [t] = e.options,
			n = {
				allowRootKeys: qc.allowRootKeys,
				ignoreCallExpressions: qc.ignoreCallExpressions,
				iterationMethods: qc.iterationMethods,
				memoizationHooks: qc.memoizationHooks,
				...t,
			},
			r = new Set(n.iterationMethods),
			i = new Set(n.memoizationHooks);
		function a(t) {
			let a = nl(t), o = a === void 0 ? J : cl(e.sourceCode, a, r, i), s = o.iteration || o.memoization;
			if (ul(t) && !s) {
				!n.allowRootKeys && t.type === `JSXElement` && $c(t) &&
					e.report({ messageId: `rootComponentWithKey`, node: t });
				return;
			}
			if (
				!dl(t, n.ignoreCallExpressions) && !(hl(t) || ml(t) || gl(t)) && !(t.type === `JSXFragment` && _l(t)) &&
				!(t.type === `JSXFragment` && o.memoization && !o.iteration && ll(t))
			) {
				if (t.type === `JSXFragment`) {
					e.report({ messageId: `missingKey`, node: t });
					return;
				}
				$c(t) || e.report({ messageId: `missingKey`, node: t });
			}
		}
		return { JSXElement: a, JSXFragment: a };
	},
	meta: {
		docs: { description: `Require keys on React components when used in lists or iteration.` },
		messages: {
			missingKey:
				"JSX element in list/callback lacks key prop. React Luau warns about missing keys in _G.__DEV__ mode. Add a unique `key` prop using a stable identifier (not array index).",
			rootComponentWithKey:
				"Root return has unnecessary key prop. The key gets overwritten by the parent anyway. Remove the `key` prop.",
		},
		schema: [{
			additionalProperties: !1,
			properties: {
				allowRootKeys: {
					default: !1,
					description: `Allow key props on root component returns`,
					type: `boolean`,
				},
				ignoreCallExpressions: {
					default: [`ReactTree.mount`],
					description: `Function calls where JSX arguments don't need keys`,
					items: { type: `string` },
					type: `array`,
				},
				iterationMethods: {
					default: qc.iterationMethods,
					description: `Array method names that indicate iteration contexts where keys are required`,
					items: { type: `string` },
					type: `array`,
				},
				memoizationHooks: {
					default: [`useCallback`, `useMemo`],
					description: `Hook names that indicate memoization contexts where keys are required`,
					items: { type: `string` },
					type: `array`,
				},
			},
			type: `object`,
		}],
		type: `problem`,
	},
});
function yl(e) {
	if (e.id.type === `Identifier`) return e.id.name;
}
function bl(e, t, n) {
	return e.callee.type === `Identifier` ?
		t.has(e.callee.name) :
		e.callee.type !== `MemberExpression` || e.callee.property.type !== `Identifier` ||
			e.callee.property.name !== `memo` || e.callee.object.type !== `Identifier` ?
		!1 :
		n.has(e.callee.object.name);
}
function xl(e, t, n) {
	return e.callee.type === `Identifier` ?
		t.has(e.callee.name) :
		e.callee.type !== `MemberExpression` || e.callee.property.type !== `Identifier` ||
			e.callee.property.name !== `createContext` || e.callee.object.type !== `Identifier` ?
		!1 :
		n.has(e.callee.object.name);
}
function Sl(e) {
	let t = e;
	for (; t !== null;) {
		if (t.type === `ExportNamedDeclaration` || t.type === `ExportDefaultDeclaration`) return !0;
		t = t.parent;
	}
	return !1;
}
function Cl(e) {
	return e.parent.type === `VariableDeclaration` ?
		e.parent.parent.type === `ExportNamedDeclaration` || e.parent.parent.type === `ExportDefaultDeclaration` :
		!1;
}
function wl(e, t, n) {
	for (let r of e.getDeclaredVariables(t)) {
		if (r.name === n) {
			for (let { identifier: e } of r.references) if (Sl(e)) return !0;
			return !1;
		}
	}
	return !1;
}
function Tl(e, t, n, r) {
	return r.has(t) || Cl(n) ? !0 : wl(e, n, t);
}
const El = c({
	create(e) {
		let t = E(rt(e.options[0])), n = new Set(), r = new Set(), i = new Set(), a = new Map(), o = new Set();
		return {
			'AssignmentExpression[left.type="MemberExpression"]'(e) {
				let { left: t } = e;
				if (
					t.type !== `MemberExpression` || t.property.type !== `Identifier` ||
					t.property.name !== `displayName` || t.object.type !== `Identifier`
				) return;
				let n = a.get(t.object.name);
				n !== void 0 && (n.hasDisplayName = !0);
			},
			ExportDefaultDeclaration(t) {
				if (t.declaration.type === `CallExpression`) {
					if (bl(t.declaration, n, i)) {
						e.report({ messageId: `directMemoExport`, node: t });
						return;
					}
					xl(t.declaration, r, i) && e.report({ messageId: `directContextExport`, node: t });
					return;
				}
				t.declaration.type === `Identifier` && o.add(t.declaration.name);
			},
			ExportNamedDeclaration(e) {
				for (let t of e.specifiers) {
					t.exported.type !== `Identifier` || t.exported.name !== `default` ||
						t.local.type !== `Identifier` || o.add(t.local.name);
				}
			},
			ImportDeclaration(e) {
				if (nt(e, t)) {
					for (let t of e.specifiers) {
						if (t.type === `ImportSpecifier`) {
							let e = se(t);
							e === `memo` && n.add(t.local.name), e === `createContext` && r.add(t.local.name);
							continue;
						}
						i.add(t.local.name);
					}
				}
			},
			"Program:exit"() {
				for (let [t, n] of a) {
					n.hasDisplayName ||
						Tl(e.sourceCode, t, n.node, o) &&
							e.report({
								data: { variableName: t },
								messageId: n.kind === `context` ?
									`missingContextDisplayName` :
									`missingMemoDisplayName`,
								node: n.node,
							});
				}
			},
			VariableDeclarator(e) {
				if (e.init?.type !== `CallExpression`) return;
				let t = yl(e);
				if (t !== void 0) {
					if (bl(e.init, n, i)) {
						a.set(t, { hasDisplayName: !1, kind: `memo`, node: e });
						return;
					}
					xl(e.init, r, i) && a.set(t, { hasDisplayName: !1, kind: `context`, node: e });
				}
			},
		};
	},
	meta: {
		docs: { description: `Require displayName on exported memo components and contexts.` },
		messages: {
			directContextExport: `Directly exporting createContext() result prevents setting displayName.`,
			directMemoExport: `Directly exporting memo() result prevents setting displayName.`,
			missingContextDisplayName: `Context '{{variableName}}' must have a displayName assigned.`,
			missingMemoDisplayName: `Memo component '{{variableName}}' must have a displayName assigned.`,
		},
		schema: [{
			additionalProperties: !1,
			properties: { environment: { enum: [`roblox-ts`, `standard`], type: `string` } },
			type: `object`,
		}],
		type: `problem`,
	},
});
function Dl(e) {
	return h(e) && e.metric === `statements` ? `statements` : `lines`;
}
function Ol(e, t) {
	let n = e.consequent.length;
	if (n === 0) return !1;
	let [r] = e.consequent;
	if (r === void 0 || n === 1 && r.type === `BlockStatement`) return !1;
	if (t === `statements`) return n > 1;
	let i = e.consequent[n - 1];
	return i === void 0 ? !1 : r.loc.start.line !== i.loc.end.line;
}
const kl = c({
	create(e) {
		let t = Dl(e.options[0]);
		return {
			SwitchCase(n) {
				if (!Ol(n, t)) return;
				let [r] = n.consequent, i = n.consequent.at(-1);
				r === void 0 || i === void 0 || e.report({
					fix(e) {
						return [
							e.insertTextBefore(
								r,
								`{
`,
							),
							e.insertTextAfter(
								i,
								`
}`,
							),
						];
					},
					messageId: `wrapCaseBody`,
					node: r,
				});
			},
		};
	},
	meta: {
		docs: { description: `Require braces around switch case bodies that span multiple lines.` },
		fixable: `code`,
		messages: { wrapCaseBody: `Wrap this switch case body in braces.` },
		schema: [{
			additionalProperties: !1,
			properties: { metric: { default: `lines`, enum: [`lines`, `statements`], type: `string` } },
			type: `object`,
		}],
		type: `problem`,
	},
});
function Al(e) {
	return e.includes(`u`) || e.includes(`v`);
}
function jl(e, t) {
	return e.type === `Identifier` && e.name === t;
}
function Ml(e) {
	if (!(e.type !== `Literal` || typeof e.value != `string`)) return e.value;
}
function Nl(e) {
	return e.type !== `SpreadElement`;
}
const Pl = c({
	create(e) {
		return {
			CallExpression(t) {
				if (!jl(t.callee, `regex`)) return;
				if (t.arguments.length < 2) {
					e.report({ messageId: `requireUnicodeFlag`, node: t });
					return;
				}
				let [, n] = t.arguments;
				if (n === void 0 || !Nl(n)) return;
				let r = Ml(n);
				r !== void 0 && (Al(r) || e.report({ messageId: `requireUnicodeFlag`, node: t }));
			},
		};
	},
	meta: {
		docs: { description: `Require the 'u' or 'v' unicode flag on arktype regex() calls.` },
		messages: {
			requireUnicodeFlag:
				`Missing the 'u' or 'v' unicode flag on this regex() call. Use the unicode flag to avoid silently creating invalid regex patterns.`,
		},
		schema: [],
		type: `problem`,
	},
});
function Fl(e, t) {
	t.type === `ObjectExpression` && t.properties.length === 0 &&
	e.report({ messageId: `emptyObjectDefault`, node: t }),
		t.type === `ArrayExpression` && t.elements.length === 0 &&
		e.report({ messageId: `emptyArrayDefault`, node: t });
}
function Il(e, t) {
	for (let n of t) {
		if (n.type === `AssignmentPattern` && n.left.type === `ObjectPattern`) {
			v(n.right) && Fl(e, n.right);
			for (let t of n.left.properties) {
				if (t.type !== `Property` || t.value.type !== `AssignmentPattern`) continue;
				let n = t.value.right;
				v(n) && Fl(e, n);
			}
			continue;
		}
		if (n.type === `ObjectPattern`) {
			for (let t of n.properties) {
				if (t.type !== `Property` || t.value.type !== `AssignmentPattern`) continue;
				let n = t.value.right;
				v(n) && Fl(e, n);
			}
		}
	}
}
function Ll(e) {
	if (!(e.type !== `FunctionDeclaration` || !ur(e))) return [...e.params];
}
function Rl(e) {
	if (
		!(e.type !== `VariableDeclarator` || !pr(e) || e.init === null) &&
		!(e.init.type !== `ArrowFunctionExpression` && e.init.type !== `FunctionExpression`)
	) return [...e.init.params];
}
const zl = c({
		create(e) {
			return {
				FunctionDeclaration(t) {
					let n = Ll(t);
					n !== void 0 && Il(e, n);
				},
				VariableDeclarator(t) {
					let n = Rl(t);
					n !== void 0 && Il(e, n);
				},
			};
		},
		meta: {
			docs: {
				description: `Prevent inline empty object and array defaults in component prop destructuring.`,
				recommended: !0,
			},
			messages: {
				emptyArrayDefault:
					`Default prop value [] creates a new array reference every render — extract to a module-level constant`,
				emptyObjectDefault:
					`Default prop value {} creates a new object reference every render — extract to a module-level constant`,
			},
			type: `problem`,
		},
	}),
	Bl = /([\p{Ll}\d])(\p{Lu})/gu,
	Vl = /(\p{Lu})(\p{Lu}\p{Ll})/gu,
	Hl = `$1\0$2`;
function Ul(e) {
	let t = e.trim();
	if (t.length === 0) return ``;
	let n = t.replace(Bl, Hl).replace(Vl, Hl), r = 0, { length: i } = n;
	for (; n.charCodeAt(r) === 0;) r += 1;
	if (r === i) return ``;
	for (; n.charCodeAt(i - 1) === 0;) --i;
	let a = ``, o = r;
	for (let e = r; e <= i; e += 1) {
		if (!(e !== i && n.charCodeAt(e) !== 0)) {
			if (e > o) {
				let t = n.slice(o, e), r = t.charCodeAt(0);
				a.length > 0 && r >= 48 && r <= 57 && (a += `_`), a += t[0].toUpperCase() + t.slice(1).toLowerCase();
			}
			o = e + 1;
		}
	}
	return a;
}
const Wl = new o({ extensions: [`.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`, `.json`, `.node`] }), Gl = { found: !1 };
function Kl(e, n) {
	if (!e.startsWith(`.`)) return Gl;
	let { path: r } = Wl.sync(t(n), e);
	return r === void 0 || r === `` ? Gl : { found: !0, path: r };
}
function ql(e) {
	return e.split(`/`).filter((e) => !e.startsWith(`.`));
}
function Jl(e) {
	return e.split(`/`).filter((e) => e === `..`).length;
}
function Yl(e) {
	return e.some((e) => e === Ul(e) && !e.includes(`.`));
}
function Xl(t) {
	return e(t, n(t)) === `index`;
}
function Zl(e) {
	if (!e.includes(`fixtures`)) return !1;
	let t = e.indexOf(`fixtures`);
	return !Yl(e.slice(0, t));
}
const Ql = c({
		create(e) {
			let t = e.options?.[0],
				{ allow: n = [], maxDepth: i = 1 } = typeof t == `object` && t ? t : { allow: [], maxDepth: 1 },
				a = n.map((e) => new RegExp(e, `v`));
			return {
				ImportDeclaration(t) {
					let n = t.source.value;
					if (typeof n != `string` || !n.startsWith(`.`) || a.some((e) => e.test(n))) return;
					let { filename: o } = e;
					if (o === ``) return;
					let s = Kl(n, o);
					if (!s.found) return;
					let c = r(o, s.path), l = ql(c);
					if ((Jl(c) > 1 || l.includes(`components`)) && Yl(l) && l.length > i && !Xl(c) && !Zl(l)) {
						e.report({ messageId: `noReachingIntoComponent`, node: t });
						return;
					}
					l.includes(`components`) && l.length > i + 1 && !Xl(c) && !Zl(l) &&
						e.report({ messageId: `noReachingIntoComponent`, node: t });
				},
			};
		},
		meta: {
			docs: { description: `Prevent module imports between components.` },
			messages: {
				noReachingIntoComponent:
					`Do not reach into an individual component's folder for nested modules. Import from the closest shared components folder instead.`,
			},
			schema: [{
				additionalProperties: !1,
				properties: { allow: { items: { type: `string` }, type: `array` }, maxDepth: { type: `integer` } },
				type: `object`,
			}],
			type: `problem`,
		},
	}),
	$l = new Set([`ArrowFunctionExpression`, `FunctionDeclaration`, `FunctionExpression`]),
	eu = new Set([
		`ArrayExpression`,
		`ArrowFunctionExpression`,
		`FunctionDeclaration`,
		`FunctionExpression`,
		`ObjectExpression`,
	]),
	tu = new Map([
		[`useCallback`, { closureIndex: 0, dependenciesIndex: 1 }],
		[`useEffect`, { closureIndex: 0, dependenciesIndex: 1 }],
		[`useImperativeHandle`, { closureIndex: 1, dependenciesIndex: 2 }],
		[`useInsertionEffect`, { closureIndex: 0, dependenciesIndex: 1 }],
		[`useLayoutEffect`, { closureIndex: 0, dependenciesIndex: 1 }],
		[`useMemo`, { closureIndex: 0, dependenciesIndex: 1 }],
		[`useSpring`, { closureIndex: 0, dependenciesIndex: 1 }],
		[`useSprings`, { closureIndex: 1, dependenciesIndex: 2 }],
		[`useTrail`, { closureIndex: 1, dependenciesIndex: 2 }],
	]),
	nu = new Map([[`useBinding`, !0], [`useReducer`, new Set([1])], [`useRef`, !0], [`useState`, new Set([1])], [
		`useTransition`,
		new Set([1]),
	]]),
	ru = new Set([`ClassDeclaration`, `FunctionDeclaration`, `FunctionName`, `ImportBinding`]),
	iu = new Set(
		`Array.BigInt.Boolean.clearInterval.clearTimeout.console.Date.decodeURI.decodeURIComponent.Document.Element.encodeURI.encodeURIComponent.Error.Event.Exclude.Extract.Function.Infinity.InstanceType.isFinite.isNaN.JSON.Map.Math.NaN.Node.NonNullable.null.Number.Object.Omit.Parameters.parseFloat.parseInt.Partial.Pick.Promise.Readonly.ReadonlyArray.ReadonlyMap.ReadonlySet.Record.RegExp.Required.ReturnType.Set.setInterval.setTimeout.String.Symbol.undefined.WeakMap.WeakSet.Window`
			.split(`.`),
	);
function au(e) {
	let { callee: t } = e;
	if (t.type === `Identifier`) return t.name;
	if (t.type === `MemberExpression` && t.property.type === `Identifier`) return t.property.name;
}
function ou(e) {
	let t = 0, n = e;
	for (n.type === `ChainExpression` && (n = n.expression); n.type === `MemberExpression`;) t += 1, n = n.object;
	return t;
}
function Z(e) {
	let t = e;
	for (
		t.type === `ChainExpression` && (t = t.expression);
		t.type === `MemberExpression` || t.type === `TSNonNullExpression`;
	) t = t.type === `MemberExpression` ? t.object : t.expression;
	return t.type === `Identifier` ? t : void 0;
}
function Q(e) {
	return e.type === `Identifier` ?
		[e.name] :
		e.type === `MemberExpression` ?
		Q(e.object) :
		e.type === `ChainExpression` || e.type === `TSNonNullExpression` || e.type === `TSAsExpression` ||
			e.type === `TSSatisfiesExpression` || e.type === `TSTypeAssertion` ?
		Q(e.expression) :
		e.type === `BinaryExpression` || e.type === `LogicalExpression` ?
		[...Q(e.left), ...Q(e.right)] :
		e.type === `UnaryExpression` ?
		Q(e.argument) :
		e.type === `ConditionalExpression` ?
		[...Q(e.test), ...Q(e.consequent), ...Q(e.alternate)] :
		[];
}
function su(e) {
	return mu.has(e.type);
}
function cu(e, t) {
	if (e.type === `Identifier`) return e.name;
	if (e.type === `ChainExpression` || su(e)) return cu(e.expression, t);
	if (e.type === `MemberExpression`) {
		let n = cu(e.object, t);
		if (e.computed) return `${n}[${t.getText(e.property)}]`;
		let r = e.property.type === `Identifier` ? e.property.name : ``;
		return `${n}${e.optional ? `?.` : `.`}${r}`;
	}
	return t.getText(e);
}
function lu(e, t, n) {
	if (e === void 0 || !(e instanceof Set) || t.type !== `VariableDeclarator` || t.id.type !== `ArrayPattern`) {
		return !1;
	}
	let { elements: r } = t.id, i = 0;
	for (let t of r) {
		if ((t?.type === `Identifier` ? t.name : void 0) === n) return e.has(i);
		i += 1;
	}
	return !1;
}
function uu(e, t, n, r) {
	if (e === null || e.type !== `CallExpression`) return !1;
	let i = au(e);
	if (i === void 0) return !1;
	let a = r.get(i);
	return a === !0 ? !0 : lu(a, t, n);
}
function du(e, t, n) {
	if (!e) return !1;
	let r = e.defs;
	if (r.length === 0) return !1;
	for (let i of r) {
		let { node: r, type: a } = i;
		if (ru.has(a)) return !0;
		if (a === `Variable` && r.type === `VariableDeclarator`) {
			let i = r, { parent: a } = i;
			if (a.type !== `VariableDeclaration` || a.kind !== `const`) continue;
			let { init: o } = i;
			if (o && uu(o, r, t, n)) return !0;
			if (o?.type === `CallExpression`) {
				let { callee: e } = o;
				if (
					e.type === `MemberExpression` && e.object.type === `Identifier` && e.object.name === `React` &&
						e.property.type === `Identifier` && e.property.name === `joinBindings` ||
					e.type === `MemberExpression` && e.property.type === `Identifier` && e.property.name === `map`
				) return !0;
			}
			if (
				o &&
				(o.type === `Literal` || o.type === `TemplateLiteral` ||
					o.type === `UnaryExpression` && o.argument.type === `Literal`)
			) return !0;
			let s = e.defs.find((e) => e.node === r);
			if (s?.node.type === `VariableDeclarator`) {
				let e = s.node.parent.parent;
				if (e && (e.type === `Program` || e.type === `ExportNamedDeclaration`)) return !0;
			}
		}
	}
	return !1;
}
function fu(e, t) {
	let n = t, r = e;
	for (; n;) {
		if (n.type === `CallExpression` && n.callee === r) {
			if (r.type === `MemberExpression`) return r.object;
			break;
		}
		let e = n.type === `MemberExpression` && n.object === r,
			t = n.type === `ChainExpression`,
			i = n.type === `TSNonNullExpression`;
		if (!e && !t && !i) break;
		r = n, n = r.parent ?? void 0;
	}
	return r;
}
const pu = new Set([`ArrowFunctionExpression`, `FunctionDeclaration`, `FunctionExpression`, `VariableDeclarator`]),
	mu = new Set([
		`TSAsExpression`,
		`TSInstantiationExpression`,
		`TSNonNullExpression`,
		`TSSatisfiesExpression`,
		`TSTypeAssertion`,
	]);
function hu(e) {
	if (e.type !== `Identifier`) return !1;
	let { parent: t } = e;
	return t.type === `Property` && t.computed && t.key === e;
}
function gu(e) {
	if (e.type !== `Identifier`) return !1;
	let t = e.parent;
	for (; t;) {
		if (mu.has(t.type)) {
			t = t.parent ?? void 0;
			continue;
		}
		if (t.type.startsWith(`TS`)) return !0;
		if (pu.has(t.type)) return !1;
		t = t.parent ?? void 0;
	}
	return !1;
}
function _u(e, t) {
	let n = t.parent ?? void 0;
	for (; n;) {
		if ($l.has(n.type)) {
			let t = n;
			return e.defs.some((e) => e.type === `Parameter` ? e.node === t : !1) ? !0 : e.defs.some((e) => {
				let n = e.node.parent ?? void 0;
				for (; n && n !== t;) n = n.parent ?? void 0;
				return n === t;
			});
		}
		n = n.parent ?? void 0;
	}
	return !1;
}
function vu(e, t) {
	if (e.type !== `Identifier`) return;
	let n, r = t;
	for (; r;) {
		let t = r.set.get(e.name);
		if (t) {
			n = t;
			break;
		}
		r = r.upper;
	}
	if (!(!n || n.defs.length === 0)) {
		for (let e of n.defs) {
			let t = e.node;
			if (t.type === `FunctionDeclaration`) return t;
			if (
				t.type === `VariableDeclarator` && t.init &&
				(t.init.type === `ArrowFunctionExpression` || t.init.type === `FunctionExpression`)
			) return t.init;
		}
	}
}
function yu(e, t) {
	let n = [], r = new Set();
	function i(a) {
		if (a.type === `Identifier`) {
			let { name: i } = a;
			if (r.has(i) || iu.has(i) || gu(a)) return;
			let o, s = t.getScope(a);
			for (; s;) {
				let e = s.set.get(i);
				if (e) {
					o = e;
					break;
				}
				s = s.upper;
			}
			if (
				o && !o.defs.some((t) => {
					let n = t.node;
					for (; n;) {
						if (n === e) return !0;
						n = n.parent ?? void 0;
					}
					return !1;
				})
			) {
				if (!_u(o, e)) return;
				r.add(i);
				let s = fu(a, a.parent), c = cu(s, t), l = ou(s);
				n.push({ depth: l, forceDependency: hu(a), name: i, node: s, usagePath: c, variable: o });
			}
		}
		if (
			a.type === `TSSatisfiesExpression` || a.type === `TSAsExpression` || a.type === `TSTypeAssertion` ||
			a.type === `TSNonNullExpression`
		) {
			i(a.expression);
			return;
		}
		if (a.type === `MemberExpression`) {
			i(a.object), a.computed && i(a.property);
			return;
		}
		if (a.type === `ChainExpression`) {
			i(a.expression);
			return;
		}
		if (a.type === `Property`) {
			a.computed && i(a.key), i(a.value);
			return;
		}
		let o = t.visitorKeys[a.type] ?? [];
		for (let e of o) {
			if (!h(a)) break;
			let t = a[e];
			if (Array.isArray(t)) { for (let e of t) v(e) && i(e); }
			else v(t) && i(t);
		}
	}
	return i(e), n;
}
function bu(e, t) {
	let n = [];
	for (let r of e.elements) {
		if (!r) continue;
		let e = r.type === `SpreadElement` ? r.argument : r, i = t.getText(e), a = ou(e);
		n.push({ depth: a, name: i, node: e });
	}
	return n;
}
function xu({ name: e }) {
	return e;
}
function Su(e) {
	return e ? eu.has(e.type) : !1;
}
function Cu(e, { parent: t }) {
	return t.type === `VariableDeclarator` ? e.variable?.defs.some((e) => e.node === t) ?? !1 : !1;
}
function wu(e) {
	return e.length > 0 && typeof e[0] == `number`;
}
function Tu(e) {
	return e.length > 0 && typeof e[0] == `string`;
}
function Eu(e) {
	return typeof e == `boolean` ?
		e :
		typeof e == `number` ?
		new Set([e]) :
		Array.isArray(e) && (wu(e) || Tu(e)) ?
		new Set(e) :
		!1;
}
function Du(e, t, n, r) {
	let i = [], a = 0;
	for (let { name: e } of t) e !== n.name && (i[a++] = e);
	let o = `[${i.join(`, `)}]`;
	e.report({
		data: { name: n.name },
		fix(e) {
			return e.replaceText(r, o);
		},
		messageId: `unnecessaryDependency`,
		node: n.node,
		suggest: [{
			data: { name: n.name },
			fix(e) {
				return e.replaceText(r, o);
			},
			messageId: `removeDependencySuggestion`,
		}],
	});
}
const Ou = c({
		create(e) {
			let [t = {}] = e.options,
				n = {
					hooks: t.hooks ?? [],
					reportMissingDependenciesArray: t.reportMissingDependenciesArray ?? !0,
					reportUnnecessaryDependencies: t.reportUnnecessaryDependencies ?? !0,
					reportUnnecessaryStableDependencies: t.reportUnnecessaryStableDependencies ?? !1,
					resolveExpressionDependencies: t.resolveExpressionDependencies ?? !0,
				},
				r = new Map(tu);
			for (let e of n.hooks) {
				e.closureIndex === void 0 || e.dependenciesIndex === void 0 ||
					r.set(e.name, { closureIndex: e.closureIndex, dependenciesIndex: e.dependenciesIndex });
			}
			let i = new Map(nu);
			for (let e of n.hooks) e.stableResult !== void 0 && i.set(e.name, Eu(e.stableResult));
			let a = new WeakMap();
			function o(t) {
				let n = a.get(t);
				if (n) return n;
				let r = e.sourceCode.getScope(t);
				return a.set(t, r), r;
			}
			return {
				CallExpression(t) {
					let a = au(t);
					if (a === void 0 || a === ``) return;
					let s = r.get(a);
					if (!s) return;
					let { closureIndex: c, dependenciesIndex: l } = s, u = t.arguments, d = u[c];
					if (d === void 0) return;
					let f;
					if (d.type === `ArrowFunctionExpression`) f = d;
					else if (
						d.type === `FunctionExpression` || d.type === `FunctionDeclaration` || d.type === `Identifier`
					) {
						let e = vu(d, o(t));
						e &&
							(e.type === `ArrowFunctionExpression` || e.type === `FunctionExpression` ||
								e.type === `FunctionDeclaration`) &&
							(f = e);
					}
					if (!f) return;
					let p = u[l];
					if (!p && n.reportMissingDependenciesArray) {
						let n = yu(f, e.sourceCode).filter((e) => !Cu(e, t)).filter((e) =>
							e.forceDependency || !du(e.variable, e.name, i)
						);
						if (n.length > 0) {
							let r = [...new Set(n.map(xu))].join(`, `),
								i = n.map(({ usagePath: e }) => e),
								a = `[${[...new Set(i)].toSorted().join(`, `)}]`;
							e.report({
								data: { deps: r },
								fix(e) {
									return e.insertTextAfter(d, `, ${a}`);
								},
								messageId: `missingDependenciesArray`,
								node: t,
								suggest: [{
									data: { dependencies: a },
									fix(e) {
										return e.insertTextAfter(d, `, ${a}`);
									},
									messageId: `addDependenciesArraySuggestion`,
								}],
							});
						}
						return;
					}
					if (!p || p.type !== `ArrayExpression`) return;
					let m = p, h = yu(f, e.sourceCode).filter((e) => !Cu(e, t)), g = bu(m, e.sourceCode);
					for (let t of g) {
						let r = Z(t.node);
						if (!r || r.type !== `Identifier`) continue;
						let a = r.name,
							o = h.filter((e) => {
								let t = Z(e.node);
								return Z(e.node)?.type === `Identifier` && t !== void 0 && `name` in t && t.name === a;
							}),
							s = o.length > 0 && o.every((e) => !e.forceDependency && du(e.variable, e.name, i));
						if (o.length === 0) {
							n.reportUnnecessaryDependencies && Du(e, g, t, m);
							continue;
						}
						if (s && n.reportUnnecessaryStableDependencies) {
							Du(e, g, t, m);
							continue;
						}
						let c = Math.max(...o.map(({ depth: e }) => e));
						t.depth > c && n.reportUnnecessaryDependencies && Du(e, g, t, m);
					}
					let _ = [];
					for (let e of h) {
						if (!e.forceDependency && du(e.variable, e.name, i)) continue;
						let t = Z(e.node);
						if (t?.type !== `Identifier`) continue;
						let r = t.name, a = !1;
						for (let t of g) {
							let i = Z(t.node);
							if (i?.type === `Identifier` && t.depth <= e.depth) {
								if (i.name === r) {
									a = !0;
									break;
								}
							} else if (n.resolveExpressionDependencies && Q(t.node).includes(r)) {
								a = !0;
								break;
							}
						}
						a || _.push(e);
					}
					if (_.length > 0) {
						let t = g.map(({ name: e }) => e),
							n = _.map(({ usagePath: e }) => e),
							r = `[${[...t, ...n].toSorted().join(`, `)}]`,
							i = g.at(-1),
							a = _.at(0);
						if (_.length === 1 && a) {
							e.report({
								data: { name: a.usagePath },
								fix(e) {
									return e.replaceText(m, r);
								},
								messageId: `missingDependency`,
								node: i?.node ?? m,
								suggest: [{
									data: { name: a.usagePath },
									fix(e) {
										return e.replaceText(m, r);
									},
									messageId: `addDependencySuggestion`,
								}],
							});
						} else {
							let t = n.join(`, `);
							e.report({
								data: { names: t },
								fix(e) {
									return e.replaceText(m, r);
								},
								messageId: `missingDependencies`,
								node: i?.node ?? m,
								suggest: [{
									fix(e) {
										return e.replaceText(m, r);
									},
									messageId: `addMissingDependenciesSuggestion`,
								}],
							});
						}
					}
					for (let t of h) {
						if (!t.forceDependency && du(t.variable, t.name, i)) continue;
						let n = Z(t.node);
						if (n?.type !== `Identifier`) continue;
						let r = n.name;
						for (let n of g) {
							let i = Z(n.node);
							if (i?.type !== `Identifier`) continue;
							let a = i.name === r && n.depth === t.depth, o = n.depth === 0;
							if (a && o) {
								let r = t.variable?.defs[0], i;
								r?.node.type === `VariableDeclarator` && (i = r.node.init ?? void 0),
									Su(i) &&
									e.report({
										data: { name: t.usagePath },
										messageId: `unstableDependency`,
										node: n.node,
									});
								break;
							}
							if (a) break;
						}
					}
				},
			};
		},
		meta: {
			docs: {
				description:
					`Enforce exhaustive and correct dependency specification in React hooks to prevent stale closures and unnecessary re-renders`,
			},
			fixable: `code`,
			hasSuggestions: !0,
			messages: {
				addDependenciesArraySuggestion: `Add dependencies array: {{dependencies}}`,
				addDependencySuggestion: `Add '{{name}}' to dependencies array`,
				addMissingDependenciesSuggestion: `Add missing dependencies to array`,
				missingDependencies: `This hook does not specify all its dependencies. Missing: {{names}}`,
				missingDependenciesArray: `This hook does not specify its dependencies array. Missing: {{deps}}`,
				missingDependency: `This hook does not specify its dependency on {{name}}.`,
				removeDependencySuggestion: `Remove '{{name}}' from dependencies array`,
				unnecessaryDependency: `This dependency {{name}} can be removed from the list.`,
				unstableDependency:
					`{{name}} changes on every re-render. Wrap the definition in useCallback() or useMemo() to stabilize it.`,
			},
			schema: [{
				additionalProperties: !1,
				properties: {
					hooks: {
						description: `Array of custom hook entries to check for exhaustive dependencies`,
						items: {
							additionalProperties: !1,
							properties: {
								closureIndex: {
									description: `Index of the closure argument for dependency validation`,
									type: `number`,
								},
								dependenciesIndex: {
									description: `Index of the dependencies array for validation`,
									type: `number`,
								},
								name: { description: `The name of the hook`, type: `string` },
								stableResult: {
									description:
										`Specify stable results: true (whole result), number (array index), number[] (multiple indices), or string[] (object properties)`,
									oneOf: [{ type: `boolean` }, { type: `number` }, {
										items: { type: `number` },
										type: `array`,
									}, { items: { type: `string` }, type: `array` }],
								},
							},
							required: [`name`],
							type: `object`,
						},
						type: `array`,
					},
					reportMissingDependenciesArray: {
						default: !0,
						description: `Report when the dependencies array is completely missing`,
						type: `boolean`,
					},
					reportUnnecessaryDependencies: {
						default: !0,
						description: `Report when unnecessary dependencies are specified`,
						type: `boolean`,
					},
					reportUnnecessaryStableDependencies: {
						default: !1,
						description:
							`Report when stable values (useRef, useState setter, etc.) are included as dependencies`,
						type: `boolean`,
					},
					resolveExpressionDependencies: {
						default: !0,
						description:
							"Recognize expression dependencies like `value !== undefined` as covering a capture",
						type: `boolean`,
					},
				},
				type: `object`,
			}],
			type: `problem`,
		},
	}),
	ku = /^use[A-Z]/v;
function Au(e) {
	return ku.test(e);
}
function ju(e) {
	return h(e) ? e : {};
}
function $(e) {
	return e.type === `Identifier`;
}
function Mu(e) {
	if ((e.type === `FunctionDeclaration` || e.type === `FunctionExpression`) && e.id !== null) {
		return y(e.id.name) || Au(e.id.name);
	}
	let { parent: t } = e;
	return t.type === `VariableDeclarator` && $(t.id) ?
		y(t.id.name) || Au(t.id.name) :
		t.type === `Property` && $(t.key) || t.type === `MethodDefinition` && $(t.key) ?
		y(t.key.name) || Au(t.key.name) :
		!1;
}
function Nu(e) {
	let t = k(e);
	return t !== void 0 && Au(t);
}
const Pu = new Set([`ArrowFunctionExpression`, `FunctionDeclaration`, `FunctionExpression`]);
function Fu(e) {
	let t = e.parent, n = !1;
	for (let r = 0; r < 20 && t !== null && !Pu.has(t.type); r += 1) {
		if (t.type === `TryStatement`) {
			let r = e;
			for (; r !== null && r !== t;) {
				if (r === t.finalizer) {
					n = !0;
					break;
				}
				r = r.parent;
			}
			break;
		}
		t = t.parent;
	}
	return n;
}
function Iu(e, t) {
	return t === void 0 ? !1 : e.callee.type === `Identifier` && `name` in e.callee && e.callee.name === t;
}
function Lu(e, t) {
	return {
		afterEarlyReturn: !1,
		functionDepth: t,
		inConditional: !1,
		inLoop: !1,
		inNestedFunction: !1,
		inTryBlock: !1,
		isComponentOrHook: !1,
		...e,
	};
}
function Ru(e) {
	if (e.type === `FunctionDeclaration` || e.type === `FunctionExpression`) return e.id?.name ?? void 0;
}
function zu(e) {
	return $(e) ? e.name : void 0;
}
const Bu = s({
	meta: { name: `small-rules` },
	rules: {
		"array-type-generic": d,
		"ban-react-fc": Je,
		"ban-types": Qe,
		"memoized-effect-dependencies": _t,
		"no-array-constructor-elements": Mt,
		"no-array-size-assignment": zt,
		"no-async-constructor": an,
		"no-cascading-set-state": sn,
		"no-commented-code": Jn,
		"no-constant-condition-with-break": cr,
		"no-giant-component": _r,
		"no-inline-property-on-memo-component": br,
		"no-instance-methods-without-this": Dr,
		"no-render-helper-functions": Rr,
		"no-underscore-react-props": zr,
		"no-unused-imports": Wr,
		"no-unused-use-memo": Kr,
		"no-use-memo-simple-expression": Jr,
		"no-useless-use-effect": Zi,
		"no-useless-use-memo": Ca,
		"prefer-class-properties": Da,
		"prefer-early-return": Ma,
		"prefer-expect-assertions": to,
		"prefer-module-scope-constants": io,
		"prefer-pascal-case-enums": mo,
		"prefer-singular-enums": Do,
		"prefer-ternary-conditional-rendering": zo,
		"prefer-use-reducer": Vo,
		"prevent-abbreviations": dc,
		"react-hooks-strict-return": Oc,
		"require-async-suffix": Nc,
		"require-module-level-instantiation": zc,
		"require-named-effect-functions": Kc,
		"require-react-component-keys": vl,
		"require-react-display-names": El,
		"require-switch-case-braces": kl,
		"require-unicode-regex": Pl,
		"rerender-memo-with-default-value": zl,
		"strict-component-boundaries": Ql,
		"use-exhaustive-dependencies": Ou,
		"use-hook-at-top-level": c({
			create(e) {
				let t = ju(e.options[0]), n = [], r = [], i, a = new Map();
				function o() {
					return n.length > 0 ? n.at(-1) : void 0;
				}
				function s(e) {
					n.push(e);
				}
				function c() {
					n.pop();
				}
				function l(e) {
					let t = o();
					t !== void 0 && (n[n.length - 1] = { ...t, ...e });
				}
				function u(e, n) {
					let { ignoreHooks: r, importSources: i, onlyHooks: o } = t;
					if (o !== void 0 && o.length > 0) return !o.includes(e);
					if (r?.includes(e) === !0) return !0;
					if (i !== void 0 && Object.keys(i).length > 0) {
						if (n.callee.type === `MemberExpression`) {
							let e = zu(n.callee.object);
							if (e !== void 0 && i[e] === !1) return !0;
							if (e !== void 0 && i[e] === !0) return !1;
						}
						if (n.callee.type === `Identifier`) {
							let t = a.get(e);
							if (t !== void 0 && i[t] === !1) return !0;
							if (t !== void 0 && i[t] === !0) return !1;
						}
					}
					return !1;
				}
				function d(e) {
					let t = o(), n = t === void 0 ? 0 : t.functionDepth + 1, a = Mu(e);
					r.push(i);
					let c = Ru(e);
					c !== void 0 && (i = c),
						t?.isComponentOrHook === !0 ?
							s(Lu({ functionDepth: n, inNestedFunction: !0 }, n)) :
							a && s(Lu({ functionDepth: n, isComponentOrHook: !0 }, n));
				}
				function f() {
					o() !== void 0 && c(), i = r.pop();
				}
				return {
					ArrowFunctionExpression: d,
					"ArrowFunctionExpression:exit": f,
					CallExpression(t) {
						if (!Nu(t)) return;
						let n = k(t);
						if (n === void 0 || u(n, t)) return;
						let r = o();
						if (!(r === void 0 || !r.isComponentOrHook && !r.inNestedFunction || Fu(t))) {
							if (Iu(t, i)) {
								e.report({ messageId: `recursiveHookCall`, node: t });
								return;
							}
							if (r.inNestedFunction) {
								e.report({ messageId: `nestedFunction`, node: t });
								return;
							}
							if (r.inConditional) {
								e.report({ messageId: `conditionalHook`, node: t });
								return;
							}
							if (r.inLoop) {
								e.report({ messageId: `loopHook`, node: t });
								return;
							}
							if (r.inTryBlock) {
								e.report({ messageId: `tryBlockHook`, node: t });
								return;
							}
							r.afterEarlyReturn && e.report({ messageId: `afterEarlyReturn`, node: t });
						}
					},
					ConditionalExpression() {
						l({ inConditional: !0 });
					},
					"ConditionalExpression:exit"() {
						l({ inConditional: !1 });
					},
					DoWhileStatement() {
						l({ inLoop: !0 });
					},
					"DoWhileStatement:exit"() {
						l({ inLoop: !1 });
					},
					ForInStatement() {
						l({ inLoop: !0 });
					},
					"ForInStatement:exit"() {
						l({ inLoop: !1 });
					},
					ForOfStatement() {
						l({ inLoop: !0 });
					},
					"ForOfStatement:exit"() {
						l({ inLoop: !1 });
					},
					ForStatement() {
						l({ inLoop: !0 });
					},
					"ForStatement:exit"() {
						l({ inLoop: !1 });
					},
					FunctionDeclaration: d,
					"FunctionDeclaration:exit": f,
					FunctionExpression: d,
					"FunctionExpression:exit": f,
					IfStatement() {
						l({ inConditional: !0 });
					},
					"IfStatement:exit"() {
						l({ inConditional: !1 });
					},
					ImportDeclaration(e) {
						let n = e.source.value;
						if (!(t.importSources === void 0 || Object.keys(t.importSources).length === 0)) {
							for (let t of e.specifiers) {
								t.type === `ImportSpecifier` && $(t.imported) && Au(t.imported.name) &&
									a.set(t.local.name, n);
							}
						}
					},
					LogicalExpression() {
						l({ inConditional: !0 });
					},
					"LogicalExpression:exit"() {
						l({ inConditional: !1 });
					},
					"ReturnStatement:exit"() {
						l({ afterEarlyReturn: !0 });
					},
					SwitchStatement() {
						l({ inConditional: !0 });
					},
					"SwitchStatement:exit"() {
						l({ inConditional: !1 });
					},
					TryStatement() {
						l({ inTryBlock: !0 });
					},
					"TryStatement:exit"() {
						l({ inTryBlock: !1 });
					},
					WhileStatement() {
						l({ inLoop: !0 });
					},
					"WhileStatement:exit"() {
						l({ inLoop: !1 });
					},
				};
			},
			meta: {
				docs: {
					description:
						`Enforce that React hooks are only called at the top level of components or custom hooks, never conditionally or in nested functions`,
					recommended: !0,
				},
				messages: {
					afterEarlyReturn:
						`This hook is being called after an early return. Hooks must be called unconditionally and in the same order every render.`,
					conditionalHook:
						`This hook is being called conditionally. All hooks must be called in the exact same order in every component render.`,
					loopHook:
						`This hook is being called inside a loop. All hooks must be called in the exact same order in every component render.`,
					nestedFunction:
						`This hook is being called from a nested function. All hooks must be called unconditionally from the top-level component.`,
					recursiveHookCall:
						`This hook is being called recursively. Recursive calls require a condition to terminate, which violates hook rules.`,
					tryBlockHook:
						`This hook is being called inside a try block. Hooks must be called unconditionally at the top level.`,
				},
				schema: [{
					additionalProperties: !1,
					properties: {
						ignoreHooks: { items: { type: `string` }, type: `array` },
						importSources: { additionalProperties: { type: `boolean` }, type: `object` },
						onlyHooks: { items: { type: `string` }, type: `array` },
					},
					type: `object`,
				}],
				type: `problem`,
			},
		}),
	},
});
export { Bu as default };
