import { emitFile } from "@typespec/compiler";
import { collectServices, extractFields, scalarName, isArrayType, isRecordType, isModelType, isUnionType, arrayElementType, recordElementType, toPascalCase, dottedPathToPascalCase, checkAndReportReservedKeywords, safeFieldName, } from "@specodec/typespec-emitter-core";
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
function writeExpr(expr, type, w) {
    if (isArrayType(type)) {
        const elem = arrayElementType(type);
        return [
            `${w}.BeginArray(${expr}.Count)`,
            `${expr} |> Seq.iter (fun item -> ${w}.NextElement(); ${writeExpr("item", elem, w)})`,
            `${w}.EndArray()`,
        ].join("\n        ");
    }
    if (isRecordType(type)) {
        const elem = recordElementType(type);
        return [
            `${w}.BeginObject(${expr}.Count)`,
            `${expr} |> Map.iter (fun k v -> ${w}.WriteField(k); ${writeExpr("v", elem, w)})`,
            `${w}.EndObject()`,
        ].join("\n        ");
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
    if (type.kind === "Enum")
        return `${w}.WriteString(${expr}.ToString())`;
    if (isUnionType(type) && type.name)
        return `${type.name}Methods.write ${w} ${expr}`;
    if (type.kind === "Model" && type.name)
        return `${type.name}Methods.write ${w} ${expr}`;
    return `// TODO: unknown type`;
}
function readExpr(type, r, optional) {
    if (isArrayType(type)) {
        const elem = arrayElementType(type);
        const fsElem = typeToFsharp(elem);
        const inner = [
            `(fun () ->`,
            `    let list = ResizeArray<${fsElem}>()`,
            `    ${r}.BeginArray()`,
            `    while ${r}.HasNextElement() do list.Add(${readExpr(elem, r)})`,
            `    ${r}.EndArray()`,
            `    list`,
            `)()`,
        ].join("\n");
        return optional ? `Some(${inner})` : inner;
    }
    if (isRecordType(type)) {
        const elem = recordElementType(type);
        const fsElem = typeToFsharp(elem);
        const inner = [
            `(fun () ->`,
            `    let dict = System.Collections.Generic.Dictionary<string, ${fsElem}>()`,
            `    ${r}.BeginObject()`,
            `    while ${r}.HasNextField() do`,
            `        let key = ${r}.ReadFieldName()`,
            `        dict.[key] <- ${readExpr(elem, r)}`,
            `    ${r}.EndObject()`,
            `    dict |> Seq.map (fun kvp -> kvp.Key, kvp.Value) |> Map.ofSeq`,
            `)()`,
        ].join("\n");
        return optional ? `Some(${inner})` : inner;
    }
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
    if (type.kind === "Enum") {
        const base = `${r}.ReadString()`;
        return optional ? `Some(${base})` : base;
    }
    if (isUnionType(type) && type.name) {
        const decodeCall = `${type.name}Methods.decode ${r}`;
        if (optional)
            return `if ${r}.IsNull() then (${r}.ReadNull(); None) else Some(${decodeCall})`;
        return decodeCall;
    }
    if (type.kind === "Model" && type.name) {
        const decodeCall = `${type.name}Methods.decode ${r}`;
        if (optional)
            return `if ${r}.IsNull() then (${r}.ReadNull(); None) else Some(${decodeCall})`;
        return decodeCall;
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
function generateModelCode(m, _pkg) {
    const fields = extractFields(m);
    const optionalFields = fields.filter((f) => f.optional);
    const requiredFields = fields.filter((f) => !f.optional);
    const allFields = [...requiredFields, ...optionalFields];
    const fsField = (f) => safeFieldName("fsharp", toPascalCase(f.name));
    const lines = [];
    if (fields.length === 0) {
        lines.push(`type ${m.name} = { }`);
    }
    else {
        lines.push(`type ${m.name} = {`);
        for (let i = 0; i < allFields.length; i++) {
            const f = allFields[i];
            const semi = i < allFields.length - 1 ? ";" : "";
            if (f.optional) {
                lines.push(`    ${fsField(f)}: option<${typeToFsharp(f.type)}>${semi}`);
            }
            else {
                lines.push(`    ${fsField(f)}: ${typeToFsharp(f.type)}${semi}`);
            }
        }
        lines.push(`}`);
    }
    lines.push(``);
    lines.push(`module ${m.name}Methods =`);
    lines.push(`    let write (w: SpecWriter) (obj: ${m.name}) =`);
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
    for (const f of requiredFields) {
        const fname = fsField(f);
        lines.push(`        w.WriteField("${f.name}"); ${writeExpr(`obj.${fname}`, f.type, "w")}`);
    }
    for (const f of optionalFields) {
        const fname = fsField(f);
        lines.push(`        match obj.${fname} with`);
        lines.push(`        | Some v -> w.WriteField("${f.name}"); ${writeExpr("v", f.type, "w")}`);
        lines.push(`        | None -> ()`);
    }
    lines.push(`        w.EndObject()`);
    lines.push(``);
    lines.push(`    let decode (r: SpecReader) =`);
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
    lines.push(`        r.BeginObject()`);
    lines.push(`        while r.HasNextField() do`);
    lines.push(`            match r.ReadFieldName() with`);
    for (const f of fields) {
        const fname = toPascalCase(f.name);
        const rExpr = readExpr(f.type, "r", f.optional || isModelType(f.type) || isUnionType(f.type));
        lines.push(`            | "${f.name}" -> _${fname} <- ${rExpr}`);
    }
    lines.push(`            | _ -> r.Skip()`);
    lines.push(`        r.EndObject()`);
    const ctorPairs = allFields
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
    lines.push(``);
    lines.push(`    let codec = SpecCodec<${m.name}>(encode = write, decode = decode)`);
    return lines.join("\n");
}
function generateUnionCode(u, L) {
    const unionName = u.name;
    L.push(`type ${unionName} =`);
    for (const v of u.variants) {
        const pascalName = toPascalCase(v.name);
        L.push(`    | ${unionName}${pascalName} of ${typeToFsharp(v.type)}`);
    }
    L.push(`    | Undefined`);
    L.push(``);
    L.push(`module ${unionName}Methods =`);
    L.push(`    let write (w: SpecWriter) (obj: ${unionName}) =`);
    L.push(`        w.BeginObject(1)`);
    L.push(`        match obj with`);
    for (const v of u.variants) {
        const pascalName = toPascalCase(v.name);
        L.push(`        | ${unionName}${pascalName} v -> w.WriteField("${v.name}"); ${writeExpr("v", v.type, "w")}`);
    }
    L.push(`        | Undefined -> failwith "cannot encode Undefined for ${unionName}"`);
    L.push(`        w.EndObject()`);
    L.push(``);
    L.push(`    let decode (r: SpecReader) =`);
    L.push(`        r.BeginObject()`);
    L.push(`        if not (r.HasNextField()) then r.EndObject(); failwith "empty union"`);
    L.push(`        let field = r.ReadFieldName()`);
    L.push(`        let result =`);
    L.push(`            match field with`);
    for (const v of u.variants) {
        const pascalName = toPascalCase(v.name);
        L.push(`            | "${v.name}" -> ${unionName}${pascalName}(${readExpr(v.type, "r")})`);
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
    for (const svc of services) {
        const pkg = svc.serviceName || "GlobalNamespace";
        const lines = [];
        lines.push("// Generated by @specodec/typespec-emitter-fsharp. DO NOT EDIT.");
        if (svc.namespace.name && svc.namespace.name !== "global") {
            lines.push(`namespace ${dottedPathToPascalCase(pkg)}`);
        }
        lines.push(``);
        lines.push(`open Specodec`);
        lines.push(`open System`);
        lines.push(`open System.Collections.Generic`);
        lines.push(``);
        for (const e of svc.enums) {
            if (!e.name)
                continue;
            lines.push(generateEnumCode(e));
            lines.push(``);
        }
        for (const m of svc.models) {
            if (!m.name)
                continue;
            lines.push(generateModelCode(m, pkg));
            lines.push(``);
        }
        for (const u of svc.unions) {
            generateUnionCode(u, lines);
            lines.push(``);
        }
        const fileName = `${dottedPathToPascalCase(svc.serviceName || "GlobalNamespace")}Types.fs`;
        await emitFile(program, { path: `${outputDir}/${fileName}`, content: lines.join("\n") });
    }
}
