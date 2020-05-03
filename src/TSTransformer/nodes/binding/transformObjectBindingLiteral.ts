import ts from "byots";
import * as lua from "LuaAST";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { diagnostics } from "TSTransformer/diagnostics";
import { transformArrayBindingLiteral } from "TSTransformer/nodes/binding/transformArrayBindingLiteral";
import { transformWritableExpression } from "TSTransformer/nodes/transformWritable";
import { getSubType } from "TSTransformer/util/binding/getSubType";
import { objectAccessor } from "TSTransformer/util/binding/objectAccessor";
import { pushToVar } from "TSTransformer/util/pushToVar";
import { skipDownwards } from "TSTransformer/util/skipDownwards";
import { transformInitializer } from "TSTransformer/util/transformInitializer";

export function transformObjectBindingLiteral(
	state: TransformState,
	bindingLiteral: ts.ObjectLiteralExpression,
	parentId: lua.AnyIdentifier,
	accessType: ts.Type | ReadonlyArray<ts.Type>,
) {
	for (const property of bindingLiteral.properties) {
		if (ts.isShorthandPropertyAssignment(property)) {
			const name = property.name;
			const value = objectAccessor(state, parentId, name, name, name);
			const id = transformWritableExpression(state, name);
			state.prereq(lua.create(lua.SyntaxKind.Assignment, { left: id, right: value }));
			assert(lua.isAnyIdentifier(id));
			if (property.objectAssignmentInitializer) {
				state.prereq(transformInitializer(state, id, property.objectAssignmentInitializer));
			}
		} else if (ts.isSpreadAssignment(property)) {
			state.addDiagnostic(diagnostics.noDotDotDotDestructuring(property));
			return;
		} else if (ts.isPropertyAssignment(property)) {
			const name = property.name;
			let init: ts.Expression | ts.ObjectLiteralElementLike = property.initializer;
			let initializer: ts.Expression | undefined;
			if (ts.isBinaryExpression(property.initializer)) {
				initializer = skipDownwards(property.initializer.right);
				init = skipDownwards(property.initializer.left);
			}

			const value = objectAccessor(state, parentId, name, name, name);
			if (ts.isIdentifier(init) || ts.isElementAccessExpression(init) || ts.isPropertyAccessExpression(init)) {
				const id = transformWritableExpression(state, init);
				state.prereq(lua.create(lua.SyntaxKind.Assignment, { left: id, right: value }));
				if (initializer) {
					state.prereq(transformInitializer(state, id, initializer));
				}
			} else if (ts.isArrayLiteralExpression(init)) {
				const id = pushToVar(state, value);
				if (initializer) {
					state.prereq(transformInitializer(state, id, initializer));
				}
				assert(ts.isIdentifier(name));
				transformArrayBindingLiteral(state, init, id, getSubType(state, accessType, name.text));
			} else if (ts.isObjectLiteralExpression(init)) {
				const id = pushToVar(state, value);
				if (initializer) {
					state.prereq(transformInitializer(state, id, initializer));
				}
				assert(ts.isIdentifier(name));
				transformObjectBindingLiteral(state, init, id, getSubType(state, accessType, name.text));
			} else {
				assert(false);
			}
		} else {
			assert(false);
		}
	}
}
