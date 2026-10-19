"""Offline structural check using cfn-lint's installed AWS resource schemas.

This portable check supplements (does not replace) cfn-lint and a real staging
deployment. It deliberately skips intrinsic expressions during type checking.
"""
import argparse
import json
from pathlib import Path
import re
import sys

import yaml


class Loader(yaml.SafeLoader):
    pass


def intrinsic(loader, tag, node):
    if isinstance(node, yaml.ScalarNode):
        value = loader.construct_scalar(node)
    elif isinstance(node, yaml.SequenceNode):
        value = loader.construct_sequence(node)
    else:
        value = loader.construct_mapping(node)
    return {tag if tag == "Ref" else "Fn::" + tag: value}


Loader.add_multi_constructor("!", intrinsic)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("template")
    parser.add_argument("--schemas", required=True, help="cfnlint/data/schemas directory")
    options = parser.parse_args()
    root = Path(options.schemas)
    providers = json.loads((root / "providers/us-east-1.json").read_text())
    providers.update(json.loads((root / "providers/ap-south-1.json").read_text()))
    template = yaml.load(Path(options.template).read_text(encoding="utf-8"), Loader=Loader)
    errors = []

    def check(value, schema, document, path):
        if isinstance(value, dict) and any(key == "Ref" or key.startswith("Fn::") for key in value):
            return
        if "$ref" in schema:
            resolved = document
            for part in schema["$ref"].removeprefix("#/").split("/"):
                resolved = resolved[part]
            return check(value, resolved, document, path)
        if isinstance(value, dict):
            fields = schema.get("properties", {})
            if schema.get("additionalProperties") is False:
                for key in value.keys() - fields.keys():
                    if not any(re.search(pattern, key) for pattern in schema.get("patternProperties", {})):
                        errors.append(f"{path}: unknown property {key}")
            for key in schema.get("required", []):
                if key not in value:
                    errors.append(f"{path}: missing property {key}")
            for key, item in value.items():
                if key in fields:
                    check(item, fields[key], document, path + "." + key)
                for pattern, definition in schema.get("patternProperties", {}).items():
                    if re.search(pattern, key):
                        check(item, definition, document, path + "." + key)
        if isinstance(value, list):
            for index, item in enumerate(value):
                check(item, schema.get("items", {}), document, f"{path}[{index}]")
        if "enum" in schema and value not in schema["enum"]:
            errors.append(f"{path}: value outside supported enum")

    resources = template["Resources"]
    known = set(resources) | set(template.get("Parameters", {}))
    for name, resource in resources.items():
        kind = resource["Type"]
        if kind not in providers:
            errors.append(f"{name}: unavailable schema {kind}")
            continue
        schema = json.loads((root / "resources" / (providers[kind] + ".json")).read_text())
        check(resource.get("Properties", {}), schema, schema, name)
        dependencies = resource.get("DependsOn", [])
        for dependency in [dependencies] if isinstance(dependencies, str) else dependencies:
            if dependency not in resources:
                errors.append(f"{name}: unresolved dependency {dependency}")

    def references(value):
        if isinstance(value, dict):
            for key, item in value.items():
                if key == "Ref" and item not in known and not item.startswith("AWS::"):
                    errors.append(f"Unknown Ref: {item}")
                if key == "Fn::GetAtt":
                    target = item.split(".")[0] if isinstance(item, str) else item[0]
                    if target not in resources:
                        errors.append(f"Unknown GetAtt: {target}")
                references(item)
        elif isinstance(value, list):
            for item in value:
                references(item)

    references(template)
    for error in errors:
        print(error, file=sys.stderr)
    if errors:
        return 1
    print(f"AWS schema property and reference checks passed for {len(resources)} resources.")
    print("Intrinsic evaluation, account permissions and live deployment still require cfn-lint/AWS validation.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
