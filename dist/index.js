import { emitFile } from "@typespec/compiler";
import { collectServices, extractFields, scalarName, isArrayType, isRecordType, isModelType, isUnionType, arrayElementType, recordElementType, toPascalCase, checkAndReportReservedKeywords, safeFieldName, } from "@specodec/typespec-emitter-core";
function typeToFsharp(type) {
    if (isArrayType(type))
        return `ResizeArray<${typeToFsharp(arrayElementType(type))}>`;
    if (isRecordType(type))
        return `Map<string, ${typeToFsharp(recordElementType(type))}>`;
    const n = scalarName(type);
    if (n) {
        switch (n) {
            case "string":
                return "string";
            case "boolean":
                return "bool";
            case "int8":
            case "int16":
            case "int32":
            case "integer":
                return "int";
            case "int64":
                return "int64";
            case "uint8":
            case "uint16":
            case "uint32":
                return "uint32";
            case "uint64":
                return "uint64";
            case "float32":
                return "float32";
            case "float64":
            case "float":
            case "decimal":
                return "float";
            case "bytes":
                return "byte[]";
        }
    }
    if (type.kind === "Enum")
        return "string";
    if (isUnionType(type))
        return type.name || "obj";
    if (type.kind === "Model")
        return type.name || "obj";
    return "obj";
}
function defaultValue(type) {
    if (isArrayType(type))
        return `ResizeArray<${typeToFsharp(arrayElementType(type))}>()`;
    if (isRecordType(type))
        return "Map.empty";
    const n = scalarName(type);
    if (n) {
        switch (n) {
            case "string":
                return '""';
            case "boolean":
                return "false";
            case "int8":
            case "int16":
            case "int32":
            case "integer":
                return "0";
            case "int64":
                return "0L";
            case "uint8":
            case "uint16":
            case "uint32":
                return "0u";
            case "uint64":
                return "0UL";
            case "float32":
                return "0.0f";
            case "float64":
            case "float":
            case "decimal":
                return "0.0";
            case "bytes":
                return "Array.empty<byte>";
        }
    }
    if (type.kind === "Enum")
        return '""';
    if (isUnionType(type) && type.name)
        return `${type.name}.Undefined`;
    if (type.kind === "Model" && type.name)
        return `Unchecked.defaultof<${type.name}>`;
    return "Unchecked.defaultof<obj>";
}
function writeExpr(expr, type, w, selfName) {
    if (isArrayType(type)) {
        const elem = arrayElementType(type);
        return `${w}.WriteArray(${expr}, fun ${w} item -> ${writeExpr("item", elem, w, selfName)})`;
    }
    if (isRecordType(type)) {
        const elem = recordElementType(type);
        return `${w}.WriteMap(${expr}, fun ${w} v -> ${writeExpr("v", elem, w, selfName)})`;
    }
    const n = scalarName(type);
    if (n) {
        switch (n) {
            case "string":
                return `${w}.WriteString(${expr})`;
            case "boolean":
                return `${w}.WriteBool(${expr})`;
            case "int8":
            case "int16":
            case "int32":
            case "integer":
                return `${w}.WriteInt32(${expr})`;
            case "int64":
                return `${w}.WriteInt64(${expr})`;
            case "uint8":
            case "uint16":
            case "uint32":
                return `${w}.WriteUint32(${expr})`;
            case "uint64":
                return `${w}.WriteUint64(${expr})`;
            case "float32":
                return `${w}.WriteFloat32(${expr})`;
            case "float64":
            case "float":
            case "decimal":
                return `${w}.WriteFloat64(${expr})`;
            case "bytes":
                return `${w}.WriteBytes(${expr})`;
        }
    }
    if (isUnionType(type) && type.name) {
        const name = type.name;
        const prefix = (name === selfName) ? "" : `${name}Methods.`;
        return `${prefix}write ${w} ${expr}`;
    }
    if (type.kind === "Model" && type.name) {
        const name = type.name;
        const prefix = (name === selfName) ? "" : `${name}Methods.`;
        return `${prefix}write ${w} ${expr}`;
    }
    if (type.kind === "Enum")
        return `${w}.WriteString(${expr}.ToString())`;
    return `// TODO: unknown type`;
}
function readExpr(type, r, optional, selfName) {
    const n = scalarName(type);
    if (n) {
        let base;
        switch (n) {
            case "string":
                base = `${r}.ReadString()`;
                break;
            case "boolean":
                base = `${r}.ReadBool()`;
                break;
            case "int8":
            case "int16":
            case "int32":
            case "integer":
                base = `${r}.ReadInt32()`;
                break;
            case "int64":
                base = `${r}.ReadInt64()`;
                break;
            case "uint8":
            case "uint16":
            case "uint32":
                base = `${r}.ReadUint32()`;
                break;
            case "uint64":
                base = `${r}.ReadUint64()`;
                break;
            case "float32":
                base = `${r}.ReadFloat32()`;
                break;
            case "float64":
            case "float":
            case "decimal":
                base = `${r}.ReadFloat64()`;
                break;
            case "bytes":
                base = `${r}.ReadBytes()`;
                break;
            default:
                base = `Unchecked.defaultof<_>`;
        }
        return optional ? `Some(${base})` : base;
    }
    if (isUnionType(type) && type.name) {
        const name = type.name;
        const prefix = (name === selfName) ? "" : `${name}Methods.`;
        const decodeCall = `${prefix}decode ${r}`;
        if (optional)
            return `if ${r}.IsNull() then (${r}.ReadNull(); None) else Some(${decodeCall})`;
        return decodeCall;
    }
    if (type.kind === "Model" && type.name) {
        const name = type.name;
        const prefix = (name === selfName) ? "" : `${name}Methods.`;
        const decodeCall = `${prefix}decode ${r}`;
        if (optional)
            return `if ${r}.IsNull() then (${r}.ReadNull(); None) else Some(${decodeCall})`;
        return decodeCall;
    }
    if (type.kind === "Enum") {
        const base = `${r}.ReadString()`;
        return optional ? `Some(${base})` : base;
    }
    return `Unchecked.defaultof<_>`;
}
function generateEnumCode(e) {
    const lines = [];
    lines.push(`type ${e.name} =`);
    for (let i = 0; i < e.members.length; i++) {
        const m = e.members[i];
        lines.push(`    | ${m.name} = ${m.value}`);
    }
    return lines.join("\n");
}
function generateModelDecl(m) {
    const fields = extractFields(m);
    const fsField = (f) => safeFieldName("fsharp", toPascalCase(f.name));
    const lines = [];
    if (fields.length === 0) {
        lines.push(`type ${m.name} = | ${m.name}`);
    }
    else {
        lines.push(`type ${m.name} = {`);
        for (let i = 0; i < fields.length; i++) {
            const f = fields[i];
            const semi = i < fields.length - 1 ? ";" : "";
            if (f.optional) {
                lines.push(`    ${fsField(f)}: option<${typeToFsharp(f.type)}>${semi}`);
            }
            else {
                lines.push(`    ${fsField(f)}: ${typeToFsharp(f.type)}${semi}`);
            }
        }
        lines.push(`}`);
    }
    return lines.join("\n");
}
function generateModelMethods(m) {
    const fields = extractFields(m);
    const optionalFields = fields.filter((f) => f.optional);
    const requiredFields = fields.filter((f) => !f.optional);
    const fsField = (f) => safeFieldName("fsharp", toPascalCase(f.name));
    const lines = [];
    lines.push(`module ${m.name}Methods =`);
    lines.push(`    let rec write (w: SpecWriter) (obj: ${m.name}) =`);
    if (optionalFields.length > 0) {
        lines.push(`        let mutable fieldCount = ${requiredFields.length}`);
        for (const f of optionalFields) {
            const fname = fsField(f);
            lines.push(`        match obj.${fname} with Some _ -> fieldCount <- fieldCount + 1 | None -> ()`);
        }
        lines.push(`        w.BeginObject(fieldCount)`);
    }
    else {
        lines.push(`        w.BeginObject(${fields.length})`);
    }
    for (const f of fields) {
        const fname = fsField(f);
        if (f.optional) {
            lines.push(`        match obj.${fname} with`);
            lines.push(`        | Some v -> w.WriteField("${f.name}"); ${writeExpr("v", f.type, "w", m.name)}`);
            lines.push(`        | None -> ()`);
        }
        else {
            lines.push(`        w.WriteField("${f.name}"); ${writeExpr(`obj.${fname}`, f.type, "w", m.name)}`);
        }
    }
    lines.push(`        w.EndObject()`);
    lines.push(``);
    if (fields.length > 0) {
        lines.push(`    let rec decode (r: SpecReader) =`);
        for (const f of fields) {
            const fname = toPascalCase(f.name);
            if (f.optional) {
                lines.push(`        let mutable _${fname} : option<${typeToFsharp(f.type)}> = None`);
            }
            else if (isModelType(f.type) || isUnionType(f.type)) {
                lines.push(`        let mutable _${fname} : option<${typeToFsharp(f.type)}> = None`);
            }
            else {
                lines.push(`        let mutable _${fname} : ${typeToFsharp(f.type)} = ${defaultValue(f.type)}`);
            }
        }
        let fsharpCounter = 0;
        lines.push(`        r.BeginObject()`);
        lines.push(`        while r.HasNextField() do`);
        lines.push(`            match r.ReadFieldName() with`);
        for (const f of fields) {
            const fname = toPascalCase(f.name);
            const varName = `_${fname}`;
            if (isArrayType(f.type)) {
                const elem = arrayElementType(f.type);
                const ft = typeToFsharp(elem);
                const tmp = `_tmp`;
                const rExpr = readExpr(elem, "r", false, m.name);
                lines.push(`            | "${f.name}" ->`);
                lines.push(`                let mutable ${tmp} = ResizeArray<${ft}>()`);
                lines.push(`                r.BeginArray()`);
                lines.push(`                while r.HasNextElement() do ${tmp}.Add(${rExpr})`);
                lines.push(`                r.EndArray()`);
                lines.push(`                ${varName} <- ${tmp}`);
            }
            else if (isRecordType(f.type)) {
                const elem = recordElementType(f.type);
                const ft = typeToFsharp(elem);
                const tmp = `_tmp`;
                const rExpr = readExpr(elem, "r", false, m.name);
                lines.push(`            | "${f.name}" ->`);
                lines.push(`                let mutable ${tmp} = Map.empty<string, ${ft}>`);
                lines.push(`                r.BeginObject()`);
                lines.push(`                while r.HasNextField() do ${tmp} <- ${tmp}.Add(r.ReadFieldName(), ${rExpr})`);
                lines.push(`                r.EndObject()`);
                lines.push(`                ${varName} <- ${tmp}`);
            }
            else {
                const rExpr = readExpr(f.type, "r", f.optional || isModelType(f.type) || isUnionType(f.type), m.name);
                lines.push(`            | "${f.name}" -> ${varName} <- ${rExpr}`);
            }
        }
        lines.push(`            | _ -> r.Skip()`);
        lines.push(`        r.EndObject()`);
        const ctorPairs = fields
            .map((f) => {
            const fname = toPascalCase(f.name);
            const ff = fsField(f);
            if (!f.optional && (isModelType(f.type) || isUnionType(f.type))) {
                return `${ff} = _${fname}.Value`;
            }
            return `${ff} = _${fname}`;
        })
            .join("; ");
        lines.push(`        { ${ctorPairs} }`);
    }
    else {
        lines.push(`    let rec decode (r: SpecReader) =`);
        lines.push(`        r.BeginObject()`);
        lines.push(`        while r.HasNextField() do r.Skip()`);
        lines.push(`        r.EndObject()`);
        lines.push(`        ${m.name}`);
    }
    lines.push(``);
    lines.push(`    let codec = SpecCodec<${m.name}>(encode = write, decode = decode)`);
    return lines.join("\n");
}
function generateUnionDecl(u) {
    const unionName = u.name;
    const lines = [];
    lines.push(`type ${unionName} =`);
    for (const v of u.variants) {
        const pascalName = toPascalCase(v.name);
        lines.push(`    | ${unionName}${pascalName} of ${typeToFsharp(v.type)}`);
    }
    lines.push(`    | Undefined`);
    return lines.join("\n");
}
function generateUnionMethods(u, L) {
    const unionName = u.name;
    L.push(`module ${unionName}Methods =`);
    L.push(`    let rec write (w: SpecWriter) (obj: ${unionName}) =`);
    L.push(`        w.BeginObject(1)`);
    L.push(`        match obj with`);
    for (const v of u.variants) {
        const pascalName = toPascalCase(v.name);
        L.push(`        | ${unionName}${pascalName} v -> w.WriteField("${v.name}"); ${writeExpr("v", v.type, "w", unionName)}`);
    }
    L.push(`        | Undefined -> failwith "cannot encode Undefined for ${unionName}"`);
    L.push(`        w.EndObject()`);
    L.push(``);
    L.push(`    let rec decode (r: SpecReader) =`);
    L.push(`        r.BeginObject()`);
    L.push(`        if not (r.HasNextField()) then r.EndObject(); failwith "empty union"`);
    L.push(`        let field = r.ReadFieldName()`);
    L.push(`        let result =`);
    L.push(`            match field with`);
    for (const v of u.variants) {
        const pascalName = toPascalCase(v.name);
        L.push(`            | "${v.name}" -> ${unionName}${pascalName}(${readExpr(v.type, "r", false, unionName)})`);
    }
    L.push(`            | _ -> failwithf "unknown variant %s" field`);
    L.push(`        while r.HasNextField() do r.ReadFieldName() |> ignore; r.Skip()`);
    L.push(`        r.EndObject()`);
    L.push(`        result`);
    L.push(``);
    L.push(`    let codec = SpecCodec<${unionName}>(encode = write, decode = decode)`);
}
export async function $onEmit(context) {
    const program = context.program;
    const outputDir = context.emitterOutputDir;
    const ignoreReservedKeywords = context.options["ignore-reserved-keywords"] ?? false;
    const services = collectServices(program);
    if (checkAndReportReservedKeywords(program, services, ignoreReservedKeywords))
        return;
    const fileHeader = `// Generated by @specodec/typespec-emitter-fsharp. DO NOT EDIT.
namespace Specodec.Generated

open Specodec
open System
open System.Collections.Generic

`;
    for (const svc of services) {
        for (const e of svc.enums) {
            if (!e.name)
                continue;
            const content = fileHeader + generateEnumCode(e) + "\n";
            await emitFile(program, { path: `${outputDir}/${e.name}.fs`, content });
        }
        for (const m of svc.models) {
            if (!m.name)
                continue;
            const content = fileHeader + generateModelDecl(m) + "\n\n" + generateModelMethods(m) + "\n";
            await emitFile(program, { path: `${outputDir}/${m.name}.fs`, content });
        }
        for (const u of svc.unions) {
            const lines = [fileHeader, generateUnionDecl(u), ""];
            generateUnionMethods(u, lines);
            lines.push("");
            const content = lines.join("\n");
            await emitFile(program, { path: `${outputDir}/${u.name}.fs`, content });
        }
    }
}
