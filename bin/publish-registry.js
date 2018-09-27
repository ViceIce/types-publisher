"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const fs_extra_1 = require("fs-extra");
const yargs = require("yargs");
const get_definitely_typed_1 = require("./get-definitely-typed");
const common_1 = require("./lib/common");
const npm_client_1 = require("./lib/npm-client");
const packages_1 = require("./lib/packages");
const settings_1 = require("./lib/settings");
const versions_1 = require("./lib/versions");
const io_1 = require("./util/io");
const logging_1 = require("./util/logging");
const util_1 = require("./util/util");
const packageName = "types-registry";
const registryOutputPath = util_1.joinPaths(settings_1.outputPath, packageName);
const readme = `This package contains a listing of all packages published to the @types scope on NPM.
Generated by [types-publisher](https://github.com/Microsoft/types-publisher).`;
if (!module.parent) {
    const dry = !!yargs.argv.dry;
    util_1.done(get_definitely_typed_1.getDefinitelyTyped(common_1.Options.defaults).then(dt => main(dt, dry, new npm_client_1.UncachedNpmInfoClient())));
}
function main(dt, dry, client) {
    return __awaiter(this, void 0, void 0, function* () {
        const [log, logResult] = logging_1.logger();
        log("=== Publishing types-registry ===");
        const { version: oldVersion, highestSemverVersion, contentHash: oldContentHash, lastModified } = yield versions_1.fetchAndProcessNpmInfo(packageName, client);
        const publishClient = yield npm_client_1.NpmPublishClient.create({ defaultTag: "next" });
        // Don't include not-needed packages in the registry.
        const typings = yield packages_1.AllPackages.readTypings();
        const registryJsonData = yield npm_client_1.CachedNpmInfoClient.with(client, cachedClient => generateRegistry(typings, cachedClient));
        const registry = JSON.stringify(registryJsonData);
        const newContentHash = util_1.computeHash(registry);
        assert.equal(oldVersion.major, 0);
        assert.equal(oldVersion.minor, 1);
        const newVersion = `0.1.${oldVersion.patch + 1}`;
        const packageJson = generatePackageJson(newVersion, newContentHash);
        yield generate(registry, packageJson);
        if (!highestSemverVersion.equals(oldVersion)) {
            // There was an error in the last publish and types-registry wasn't validated.
            // This may have just been due to a timeout, so test if types-registry@next is a subset of the one we're about to publish.
            // If so, we should just update it to "latest" now.
            log("Old version of types-registry was never tagged latest, so updating");
            yield validateIsSubset(yield packages_1.readNotNeededPackages(dt));
            yield publishClient.tag(packageName, highestSemverVersion.versionString, "latest");
        }
        else if (oldContentHash !== newContentHash && !isAWeekAfter(lastModified)) {
            log("New packages have been added, so publishing a new registry.");
            yield publish(publishClient, packageJson, newVersion, dry);
        }
        else {
            const reason = oldContentHash === newContentHash ? "Was modified less than a week ago" : "No new packages published";
            log(`${reason}, so no need to publish new registry.`);
            // Just making sure...
            yield validate();
        }
        yield logging_1.writeLog("publish-registry.md", logResult());
    });
}
exports.default = main;
const millisecondsPerDay = 1000 * 60 * 60 * 24;
function isAWeekAfter(time) {
    const diff = Date.now() - time.getTime();
    const days = diff / millisecondsPerDay;
    return days > 7;
}
function generate(registry, packageJson) {
    return __awaiter(this, void 0, void 0, function* () {
        yield fs_extra_1.emptyDir(registryOutputPath);
        yield writeOutputJson("package.json", packageJson);
        yield writeOutputFile("index.json", registry);
        yield writeOutputFile("README.md", readme);
        function writeOutputJson(filename, content) {
            return io_1.writeJson(outputPath(filename), content);
        }
        function writeOutputFile(filename, content) {
            return io_1.writeFile(outputPath(filename), content);
        }
        function outputPath(filename) {
            return util_1.joinPaths(registryOutputPath, filename);
        }
    });
}
function publish(client, packageJson, version, dry) {
    return __awaiter(this, void 0, void 0, function* () {
        yield client.publish(registryOutputPath, packageJson, dry);
        // Sleep for 60 seconds to let NPM update.
        yield io_1.sleep(60);
        // Don't set it as "latest" until *after* it's been validated.
        yield validate();
        yield client.tag(packageName, version, "latest");
    });
}
function installForValidate() {
    return __awaiter(this, void 0, void 0, function* () {
        yield fs_extra_1.emptyDir(settings_1.validateOutputPath);
        yield io_1.writeJson(util_1.joinPaths(settings_1.validateOutputPath, "package.json"), {
            name: "validate",
            version: "0.0.0",
            description: "description",
            readme: "",
            license: "",
            repository: {},
        });
        const npmPath = util_1.joinPaths(__dirname, "..", "node_modules", "npm", "bin", "npm-cli.js");
        const err = (yield util_1.execAndThrowErrors(`node ${npmPath} install types-registry@next ${io_1.npmInstallFlags}`, settings_1.validateOutputPath)).trim();
        if (err) {
            console.error(err);
        }
    });
}
const validateTypesRegistryPath = util_1.joinPaths(settings_1.validateOutputPath, "node_modules", "types-registry");
function validate() {
    return __awaiter(this, void 0, void 0, function* () {
        yield installForValidate();
        yield io_1.assertDirectoriesEqual(registryOutputPath, validateTypesRegistryPath, {
            ignore: f => f === "package.json"
        });
    });
}
function validateIsSubset(notNeeded) {
    return __awaiter(this, void 0, void 0, function* () {
        yield installForValidate();
        const indexJson = "index.json";
        yield io_1.assertDirectoriesEqual(registryOutputPath, validateTypesRegistryPath, {
            ignore: f => f === "package.json" || f === indexJson,
        });
        const actual = yield io_1.readJson(util_1.joinPaths(validateTypesRegistryPath, indexJson));
        const expected = yield io_1.readJson(util_1.joinPaths(registryOutputPath, indexJson));
        for (const key in actual.entries) {
            if (!(key in expected.entries) && !notNeeded.some(p => p.name === key)) {
                throw new Error(`Actual types-registry has unexpected key ${key}`);
            }
        }
    });
}
function generatePackageJson(version, typesPublisherContentHash) {
    return {
        name: packageName,
        version,
        description: "A registry of TypeScript declaration file packages published within the @types scope.",
        repository: {
            type: "git",
            url: "https://github.com/Microsoft/types-publisher.git"
        },
        keywords: [
            "TypeScript",
            "declaration",
            "files",
            "types",
            "packages"
        ],
        author: "Microsoft Corp.",
        license: "MIT",
        typesPublisherContentHash,
    };
}
function generateRegistry(typings, client) {
    return __awaiter(this, void 0, void 0, function* () {
        const entries = {};
        for (const typing of typings) {
            const info = util_1.assertDefined(yield client.getNpmInfo(typing.fullEscapedNpmName, typing.contentHash));
            entries[typing.name] = filterTags(info.distTags);
        }
        return { entries };
        function filterTags(tags) {
            const latestTag = "latest";
            const latestVersion = tags.get(latestTag);
            const out = {};
            tags.forEach((value, tag) => {
                if (tag === latestTag || value !== latestVersion) {
                    out[tag] = value;
                }
            });
            return out;
        }
    });
}
//# sourceMappingURL=publish-registry.js.map