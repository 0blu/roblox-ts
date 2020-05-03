import ts from "byots";
import * as lua from "LuaAST";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { diagnostics } from "TSTransformer/diagnostics";
import { transformObjectBindingLiteral } from "TSTransformer/nodes/binding/transformObjectBindingLiteral";
import { transformWritableExpression } from "TSTransformer/nodes/transformWritable";
import { getAccessorForBindingType } from "TSTransformer/util/binding/getAccessorForBindingType";
import { getSubType } from "TSTransformer/util/binding/getSubType";
import { pushToVar } from "TSTransformer/util/pushToVar";
import { skipDownwards } from "TSTransformer/util/skipDownwards";
import { transformInitializer } from "TSTransformer/util/transformInitializer";

export function transformArrayBindingLiteral(
	state: TransformState,
	bindingLiteral: ts.ArrayLiteralExpression,
	parentId: lua.AnyIdentifier,
	accessType: ts.Type | ReadonlyArray<ts.Type>,
) {
	let index = 0;
	const idStack = new Array<lua.Identifier>();
	const accessor = getAccessorForBindingType(state, bindingLiteral, accessType);
	for (let element of bindingLiteral.elements) {
		if (ts.isOmittedExpression(element)) {
			accessor(state, parentId, index, idStack, true);
		} else if (ts.isSpreadElement(element)) {
			state.addDiagnostic(diagnostics.noDotDotDotDestructuring(element));
			return;
		} else {
			let initializer: ts.Expression | undefined;
			if (ts.isBinaryExpression(element)) {
				initializer = skipDownwards(element.right);
				element = skipDownwards(element.left);
			}

			const value = accessor(state, parentId, index, idStack, false);
			if (
				ts.isIdentifier(element) ||
				ts.isElementAccessExpression(element) ||
				ts.isPropertyAccessExpression(element)
			) {
				const id = transformWritableExpression(state, element);
				state.prereq(lua.create(lua.SyntaxKind.Assignment, { left: id, right: value }));
				if (initializer) {
					state.prereq(transformInitializer(state, id, initializer));
				}
			} else if (ts.isArrayLiteralExpression(element)) {
				const id = pushToVar(state, value);
				if (initializer) {
					state.prereq(transformInitializer(state, id, initializer));
				}
				transformArrayBindingLiteral(state, element, id, getSubType(state, accessType, index));
			} else if (ts.isObjectLiteralExpression(element)) {
				const id = pushToVar(state, value);
				if (initializer) {
					state.prereq(transformInitializer(state, id, initializer));
				}
				transformObjectBindingLiteral(state, element, id, getSubType(state, accessType, index));
			} else {
				assert(false);
			}
		}
		index++;
	}
}
