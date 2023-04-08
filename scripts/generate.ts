/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Ian Lucas. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { createHash } from "crypto";
import { readFileSync } from "fs";
import { resolve } from "path";
import { format } from "util";
import { CS_Item, CS_ItemDefinition } from "../src/economy.js";
import * as KeyValues from "../src/keyvalues.js";
import { CS_TEAM_CT, CS_TEAM_T, CS_Team } from "../src/teams.js";
import { IMAGES_PATH, ITEMS_PATH, LANGUAGE_PATH } from "./env.js";
import { replaceInFile, writeJson } from "./util.js";

interface CSGO_WeaponAttributes {
    "magazine model": string;
    "heat per shot": string;
    "addon scale": string;
    "tracer frequency": string;
    "primary clip size": string;
    "primary default clip size": string;
    "secondary default clip size": string;
    "is full auto": string;
    "max player speed": string;
    "in game price": string;
    "armor ratio": string;
    "crosshair min distance": string;
    "crosshair delta distance": string;
    cycletime: string | string[];
    "model right handed": string;
    penetration: string;
    damage: string;
    "headshot multiplier": string;
    range: string;
    "range modifier": string;
    bullets: string;
    "flinch velocity modifier large": string;
    "flinch velocity modifier small": string;
    spread: string;
    "inaccuracy crouch": string;
    "inaccuracy stand": string;
    "inaccuracy jump initial": string;
    "inaccuracy jump apex": string;
    "inaccuracy jump": string;
    "inaccuracy land": string;
    "inaccuracy ladder": string;
    "inaccuracy fire": string;
    "inaccuracy move": string;
    "recovery time crouch": string;
    "recovery time stand": string;
    "recoil angle": string;
    "recoil angle variance": string;
    "recoil magnitude": string;
    "recoil magnitude variance": string;
    "recoil seed": string;
    "primary reserve ammo max": string;
    "weapon weight": string;
    "rumble effect": string;
    "inaccuracy crouch alt": string;
    "inaccuracy fire alt": string;
    "inaccuracy jump alt": string;
    "inaccuracy ladder alt": string;
    "inaccuracy land alt": string;
    "inaccuracy move alt": string;
    "inaccuracy stand alt": string;
    "max player speed alt": string;
    "recoil angle variance alt": string;
    "recoil magnitude alt": string;
    "recoil magnitude variance alt": string;
    "recovery time crouch final": string;
    "recovery time stand final": string;
    "spread alt": string;
}

interface CSGO_Prefab {
    prefab: string;
    item_class: string;
    item_name: string;
    item_rarity: string;
    image_inventory: string;
    attributes: CSGO_WeaponAttributes;
    used_by_classes: Record<CS_Team, number>;
    visuals: {
        weapon_type: string;
    };
}

interface CSGO_ItemsFile {
    items_game: {
        alternate_icons2: {
            weapon_icons: {
                [key: string]: {
                    icon_path: string;
                };
            };
        };
        items: {
            [itemDef: string]: {
                name: string;
                prefab: string;
                baseitem: string;
                item_sub_position?: string;
                image_inventory: string;
                used_by_classes: Record<CS_Team, number>;
                item_name: string;
            };
        }[];
        music_definitions: {
            [musicId: string]: {
                loc_name: string;
                image_inventory: string;
            };
        }[];
        paint_kits: {
            [identifier: string]: {
                description_tag: string;
                name: string;
            };
        }[];
        paint_kits_rarity: {
            [paintName: string]: string;
        }[];
        prefabs: {
            [prefabName: string]: CSGO_Prefab;
        }[];
        sticker_kits: {
            [stickerId: string]: {
                name: string;
                item_name: string;
                tournament_event_id: string;
                sticker_material: string;
                item_rarity: string;
            };
        }[];
    };
}

interface CSGO_LanguageFile {
    lang: {
        Tokens: { [key: string]: string };
    };
}

const UNCATEGORIZED_STICKERS = [
    "standard",
    "stickers2",
    "community02",
    "tournament_assets",
    "community_mix01",
    "danger_zone"
];

class GenerateScript {
    language: string;
    itemsFile: CSGO_ItemsFile;
    languageFile: CSGO_LanguageFile;
    prefabs: { [prefabName: string]: CSGO_Prefab } = {};
    items: CS_Item[] = [];
    paints: CS_Item[] = [];
    musicKits: CS_Item[] = [];
    stickers: CS_Item[] = [];
    itemDefs: CS_ItemDefinition[] = [];
    paintKitRarity: { [paintName: string]: string } = {};
    paintKits: {
        className: string;
        value: number;
        name: string;
        rarity: string;
    }[] = [];
    weaponsAttributes: { [key: string]: CSGO_WeaponAttributes } = {};
    ids: string[] = [];

    constructor({ language }: { language?: string }) {
        this.language = language ?? "english";
        this.itemsFile = this.readItems();
        this.languageFile = this.readLanguage();
        this.ids = this.readIds();
        this.parsePrefabs();
        this.parseWeapons();
        this.parseKnives();
        this.parseGloves();
        this.parsePaintRarity();
        this.parsePaintKits();
        this.parsePaints();
        this.parseMusicKits();
        this.parseStickers();
        this.writeFiles();
    }

    readIds() {
        const contents = readFileSync(
            resolve(process.cwd(), "dist/ids.json"),
            "utf-8"
        );
        return JSON.parse(contents) as string[];
    }

    readItems() {
        const contents = readFileSync(ITEMS_PATH, "utf-8");
        return KeyValues.parse(contents) as CSGO_ItemsFile;
    }

    readLanguage() {
        const contents = readFileSync(
            format(LANGUAGE_PATH, this.language),
            "utf8" // "utf16le" on CSGO
        );
        return KeyValues.parse(contents) as CSGO_LanguageFile;
    }

    getTranslation(token: string) {
        return this.languageFile.lang.Tokens[token.substring(1)];
    }

    getCdnUrl(file: string) {
        const buffer = readFileSync(resolve(IMAGES_PATH, file + ".png"));
        const hashSum = createHash("sha1");
        hashSum.update(buffer);
        const sha1 = hashSum.digest("hex");
        return format(
            "https://steamcdn-a.akamaihd.net/apps/730/icons/%s.%s.png",
            file,
            sha1
        );
    }

    getCS_Team(team: string) {
        switch (team) {
            case "counter-terrorists":
                return CS_TEAM_CT;
            case "terrorists":
                return CS_TEAM_T;
        }
        throw new Error(format('Unknown team "%s"', team));
    }

    getTeamDesc(teams: CS_Team[]) {
        return `${teams
            .map((team) => (team === CS_TEAM_CT ? "CT" : "TR"))
            .join(" and ")}'s `;
    }

    getId(name: string) {
        const idx = this.ids.indexOf(name);
        if (idx === -1) {
            this.ids.push(name);
            return this.ids.length - 1;
        }
        return idx;
    }

    parsePrefabs() {
        for (const item of this.itemsFile.items_game.prefabs) {
            for (const [key, value] of Object.entries(item)) {
                this.prefabs[key] = value;
            }
        }
    }

    parseWeapons() {
        for (const item of this.itemsFile.items_game.items) {
            for (const [itemDef, value] of Object.entries(item)) {
                if (value.baseitem !== "1" || !value.item_sub_position) {
                    continue;
                }
                const matches = value.item_sub_position.match(/(c4|[^\d]+)/);
                if (!matches) {
                    continue;
                }
                const category = matches[1];
                if (category === "equipment") {
                    continue;
                }
                const prefab = this.prefabs[value.prefab];
                if (!prefab) {
                    throw new Error(
                        format('Unable to find prefab for "%s".', value.prefab)
                    );
                }
                this.weaponsAttributes[itemDef] = prefab.attributes;
                const name = this.getTranslation(prefab.item_name);
                const teams = Object.keys(prefab.used_by_classes).map(
                    this.getCS_Team
                );
                const id = this.getId(this.getTeamDesc(teams) + name);
                this.items.push({
                    base: true,
                    category,
                    free: true,
                    id,
                    image: prefab.image_inventory
                        ? this.getCdnUrl(prefab.image_inventory)
                        : this.getCdnUrl(
                              format("econ/weapons/base_weapons/%s", value.name)
                          ),
                    model: value.name.replace("weapon_", ""),
                    name,
                    rarity: prefab.item_rarity,
                    teams,
                    type: "weapon"
                });
                this.itemDefs.push({
                    classname: value.name,
                    def: Number(itemDef),
                    id,
                    paintid: -1
                });
            }
        }
    }

    parseKnives() {
        for (const item of this.itemsFile.items_game.items) {
            for (const [itemDef, value] of Object.entries(item)) {
                if (
                    (value.prefab === "melee" && value.baseitem !== "1") ||
                    value.prefab?.indexOf("melee") === -1 ||
                    value.prefab?.indexOf("noncustomizable") > -1 ||
                    !value.used_by_classes
                ) {
                    continue;
                }
                const prefab = this.prefabs[value.prefab];
                if (!prefab) {
                    throw new Error(
                        format("Unable to find prefab for %s", value.prefab)
                    );
                }
                const name = this.getTranslation(value.item_name);
                const teams = Object.keys(value.used_by_classes).map(
                    this.getCS_Team
                );
                const id = this.getId(this.getTeamDesc(teams) + name);
                this.items.push({
                    base: true,
                    category: "melee",
                    free: value.baseitem === "1" ? true : undefined,
                    id,
                    image: this.getCdnUrl(value.image_inventory),
                    model: value.name.replace("weapon_", ""),
                    name,
                    rarity: prefab.item_rarity,
                    teams,
                    type: "melee"
                });
                this.itemDefs.push({
                    classname: value.name,
                    def: Number(itemDef),
                    id,
                    paintid: value.baseitem === "1" ? -1 : 0
                });
            }
        }
    }

    parseGloves() {
        for (const item of this.itemsFile.items_game.items) {
            for (const [itemDef, value] of Object.entries(item)) {
                if (
                    value.prefab?.indexOf("hands") === -1 ||
                    !value.used_by_classes
                ) {
                    continue;
                }
                const prefab = this.prefabs[value.prefab];
                if (!prefab) {
                    throw new Error(
                        format("Unable to find prefab for %s", value.prefab)
                    );
                }
                const name = this.getTranslation(value.item_name);
                const teams = Object.keys(value.used_by_classes).map(
                    this.getCS_Team
                );
                const id = this.getId(this.getTeamDesc(teams) + name);
                this.items.push({
                    base: true,
                    category: "glove",
                    free: value.baseitem === "1" ? true : undefined,
                    id,
                    image: value.image_inventory
                        ? this.getCdnUrl(value.image_inventory)
                        : format("/%s.png", value.name),
                    model: value.name,
                    name,
                    rarity: "ancient",
                    teams,
                    type: "glove"
                });
                this.itemDefs.push({
                    classname: value.name,
                    def: Number(itemDef),
                    id,
                    paintid: value.baseitem === "1" ? -1 : 0
                });
            }
        }
    }

    parsePaintRarity() {
        for (const item of this.itemsFile.items_game.paint_kits_rarity) {
            for (const [paintName, rarity] of Object.entries(item)) {
                this.paintKitRarity[paintName] = rarity;
            }
        }
    }

    parsePaintKits() {
        for (const item of this.itemsFile.items_game.paint_kits) {
            for (const [paintKit, value] of Object.entries(item)) {
                if (!value.description_tag || value.name === "default") {
                    continue;
                }
                this.paintKits.push({
                    className: value.name,
                    name: this.getTranslation(value.description_tag),
                    rarity: this.paintKitRarity[value.name],
                    value: Number(paintKit)
                });
            }
        }
    }

    parsePaints() {
        for (const [key, value] of Object.entries(
            this.itemsFile.items_game.alternate_icons2.weapon_icons
        )) {
            if (!value.icon_path.match(/light$/)) {
                continue;
            }
            const paintKit = this.paintKits.find(
                (paintKit) =>
                    value.icon_path.indexOf(
                        format("_%s_light", paintKit.className)
                    ) > -1
            );
            if (!paintKit) {
                console.warn(
                    format("Unable to find paint kit for %s", value.icon_path)
                );
                continue;
            }
            const def = this.itemDefs.find(
                (item) =>
                    value.icon_path.indexOf(
                        format("%s_%s", item.classname, paintKit.className)
                    ) > -1
            );
            if (!def) {
                console.warn(
                    format("Unable to find item for %s", value.icon_path)
                );
                continue;
            }
            const item = this.items.find((item) => item.id === def.id);
            if (!item) {
                console.warn(
                    format("Unable to find item for %s", value.icon_path)
                );
                continue;
            }
            const name = format("%s | %s", item.name, paintKit.name);
            const id = this.getId(name + paintKit.value);
            this.paints.push({
                ...item,
                base: undefined,
                free: undefined,
                id,
                image: this.getCdnUrl(value.icon_path + "_large"),
                name,
                rarity: paintKit.rarity ?? item.rarity
            });
            this.itemDefs.push({
                ...def,
                id,
                paintid: paintKit.value
            });
        }
    }

    parseMusicKits() {
        for (const item of this.itemsFile.items_game.music_definitions) {
            for (const [musicId, value] of Object.entries(item)) {
                if (musicId === "2") {
                    // Skip duplicated CS:GO default music kit.
                    continue;
                }
                const name = this.getTranslation(value.loc_name);
                const id = this.getId(name);
                const musicid = Number(musicId);
                this.musicKits.push({
                    category: "musickit",
                    free: musicid === 1 ? true : undefined,
                    id,
                    image: this.getCdnUrl(value.image_inventory),
                    name,
                    rarity: "uncommon",
                    type: "musickit"
                });
                this.itemDefs.push({
                    id,
                    musicid
                });
            }
        }
    }

    parseStickers() {
        for (const item of this.itemsFile.items_game.sticker_kits) {
            for (const [stickerId, value] of Object.entries(item)) {
                if (
                    value.name === "default" ||
                    value.item_name.indexOf("SprayKit") > -1 ||
                    value.name.indexOf("spray_") > -1 ||
                    value.name.indexOf("patch_") > -1 ||
                    value.sticker_material.indexOf("_graffiti") > -1
                ) {
                    continue;
                }
                let category: string = "";
                if (!value.sticker_material) {
                    console.log(value);
                }
                const [folder] = value.sticker_material.split("/");
                if (folder === "alyx") {
                    category = this.getTranslation(
                        "#CSGO_crate_sticker_pack_hlalyx_capsule"
                    );
                }
                if (UNCATEGORIZED_STICKERS.indexOf(folder) > -1) {
                    category = "Valve";
                }
                if (!category) {
                    category = this.getTranslation(
                        format("#CSGO_sticker_crate_key_%s", folder)
                    );
                }
                if (!category) {
                    category = this.getTranslation(
                        format("#CSGO_crate_sticker_pack_%s", folder)
                    );
                }
                if (!category) {
                    category = this.getTranslation(
                        format("#CSGO_crate_sticker_pack_%s_capsule", folder)
                    );
                }
                if (value.tournament_event_id) {
                    category = this.getTranslation(
                        format(
                            "#CSGO_Tournament_Event_NameShort_%s",
                            value.tournament_event_id
                        )
                    );
                    if (!category) {
                        throw new Error(
                            format(
                                "Unable to find the short name for tournament %s.",
                                value.tournament_event_id
                            )
                        );
                    }
                }
                if (!category) {
                    console.log(value);
                    throw new Error("Unable to define a category.");
                }
                const name = this.getTranslation(value.item_name);
                const id = this.getId(name);
                this.stickers.push({
                    category,
                    id,
                    image: this.getCdnUrl(
                        format(
                            "econ/stickers/%s",
                            value.sticker_material + "_large"
                        )
                    ),
                    name,
                    rarity: value.item_rarity ?? "uncommon",
                    type: "sticker"
                });
                this.itemDefs.push({
                    id,
                    stickerid: Number(stickerId)
                });
            }
        }
    }

    writeFiles() {
        const items = [
            ...this.items,
            ...this.paints,
            ...this.musicKits,
            ...this.stickers
        ];
        writeJson("dist/parsed-items-game.json", this.itemsFile);
        writeJson("dist/weapon-attributes.json", this.weaponsAttributes);
        writeJson("dist/items.json", items);
        writeJson("dist/item-defs.json", this.itemDefs);
        writeJson("dist/ids.json", this.ids);
        replaceInFile(
            "src/items.ts",
            /CS_Item\[\] = [^;]+;/,
            format("CS_Item[] = %s;", JSON.stringify(items))
        );
        replaceInFile(
            "src/items.ts",
            /CS_ItemDefinition\[\] = [^;]+;/,
            format("CS_ItemDefinition[] = %s;", JSON.stringify(this.itemDefs))
        );
    }
}

new GenerateScript({
    language: "english"
});
