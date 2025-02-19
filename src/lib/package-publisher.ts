import assert = require("assert");
import { TypeScriptVersion } from "definitelytyped-header-parser";

import { readFileAndWarn } from "../lib/common";
import { ChangedTyping } from "../lib/versions";
import { Logger } from "../util/logging";
import { joinPaths } from "../util/util";

import { NpmPublishClient } from "./npm-client";
import { AnyPackage, NotNeededPackage } from "./packages";

export async function publishTypingsPackage(client: NpmPublishClient, changedTyping: ChangedTyping, dry: boolean, log: Logger): Promise<void> {
    const { pkg, version, latestVersion } = changedTyping;
    await common(client, pkg, log, dry);
    if (pkg.isLatest) {
        await updateTypeScriptVersionTags(pkg, version, client, log, dry);
    }
    assert((latestVersion === undefined) === pkg.isLatest);
    if (latestVersion !== undefined) {
        // If this is an older version of the package, we still update tags for the *latest*.
        // NPM will update "latest" even if we are publishing an older version of a package (https://github.com/npm/npm/issues/6778),
        // so we must undo that by re-tagging latest.
        await updateLatestTag(pkg.fullNpmName, latestVersion, client, log, dry);
    }
}

export async function publishNotNeededPackage(client: NpmPublishClient, pkg: NotNeededPackage, dry: boolean, log: Logger): Promise<void> {
    log(`Deprecating ${pkg.name}`);
    await common(client, pkg, log, dry);
    // Don't use a newline in the deprecation message because it will be displayed as "\n" and not as a newline.
    await deprecateNotNeededPackage(client, pkg, dry, log);
}

async function common(client: NpmPublishClient, pkg: AnyPackage, log: Logger, dry: boolean): Promise<void> {
    const packageDir = pkg.outputDirectory;
    const packageJson = await readFileAndWarn("generate", joinPaths(packageDir, "package.json"));
    await client.publish(packageDir, packageJson, dry, log);
}

export async function deprecateNotNeededPackage(client: NpmPublishClient, pkg: NotNeededPackage, dry = false, log: Logger): Promise<void> {
    if (dry) {
        log("(dry) Skip deprecate not needed package " + pkg.fullNpmName + " at " + pkg.version.versionString);
    } else {
        log(`Deprecating ${pkg.fullNpmName} at ${pkg.version.versionString} with message: ${pkg.deprecatedMessage()}.`);
        await client.deprecate(pkg.fullNpmName, pkg.version.versionString, pkg.deprecatedMessage());
    }
}

export async function updateTypeScriptVersionTags(
    pkg: AnyPackage, version: string, client: NpmPublishClient, log: Logger, dry: boolean,
): Promise<void> {
    const tags = TypeScriptVersion.tagsToUpdate(pkg.minTypeScriptVersion);
    log(`Tag ${pkg.fullNpmName}@${version} as ${JSON.stringify(tags)}`);
    if (dry) {
        log("(dry) Skip tag");
    } else {
        for (const tagName of tags) {
            await client.tag(pkg.fullNpmName, version, tagName, dry, log);
        }
    }
}

export async function updateLatestTag(
    fullNpmName: string, version: string, client: NpmPublishClient, log: Logger, dry: boolean): Promise<void> {
    log(`   but tag ${fullNpmName}@${version} as "latest"`);
    if (dry) {
        log("   (dry) Skip move \"latest\" back to newest version");
    } else {
        await client.tag(fullNpmName, version, "latest", dry, log);
    }
}
