"use client";

import { useEffect, useRef } from "react";
import {
  AppleIcon,
  Clock3Icon,
  FlagIcon,
  HeartIcon,
  LeafIcon,
  LightbulbIcon,
  PlaneIcon,
  SmileIcon,
  TrophyIcon,
} from "lucide-react";
import EmojiPicker, {
  Categories,
  EmojiStyle,
  SkinTonePickerLocation,
  SuggestionMode,
  Theme,
  type CategoryConfig,
} from "emoji-picker-react";
import emojiDataZh from "emoji-picker-react/dist/data/emojis-zh.js";

const CATEGORY_ICON_CLASS = "size-[18px] stroke-[1.8]";

const SKIN_TONE_LABELS = [
  ["epr-tone-neutral", "默认"],
  ["epr-tone-1f3fb", "浅色"],
  ["epr-tone-1f3fc", "中浅色"],
  ["epr-tone-1f3fd", "中等"],
  ["epr-tone-1f3fe", "中深色"],
  ["epr-tone-1f3ff", "深色"],
] as const;

const CATEGORIES = [
  {
    category: Categories.SUGGESTED,
    name: "最近使用",
    icon: <Clock3Icon aria-hidden="true" className={CATEGORY_ICON_CLASS} />,
  },
  {
    category: Categories.SMILEYS_PEOPLE,
    name: "人物",
    icon: <SmileIcon aria-hidden="true" className={CATEGORY_ICON_CLASS} />,
  },
  {
    category: Categories.ANIMALS_NATURE,
    name: "自然",
    icon: <LeafIcon aria-hidden="true" className={CATEGORY_ICON_CLASS} />,
  },
  {
    category: Categories.FOOD_DRINK,
    name: "食物",
    icon: <AppleIcon aria-hidden="true" className={CATEGORY_ICON_CLASS} />,
  },
  {
    category: Categories.ACTIVITIES,
    name: "活动",
    icon: <TrophyIcon aria-hidden="true" className={CATEGORY_ICON_CLASS} />,
  },
  {
    category: Categories.TRAVEL_PLACES,
    name: "地点",
    icon: <PlaneIcon aria-hidden="true" className={CATEGORY_ICON_CLASS} />,
  },
  {
    category: Categories.OBJECTS,
    name: "物品",
    icon: <LightbulbIcon aria-hidden="true" className={CATEGORY_ICON_CLASS} />,
  },
  {
    category: Categories.SYMBOLS,
    name: "符号",
    icon: <HeartIcon aria-hidden="true" className={CATEGORY_ICON_CLASS} />,
  },
  {
    category: Categories.FLAGS,
    name: "旗帜",
    icon: <FlagIcon aria-hidden="true" className={CATEGORY_ICON_CLASS} />,
  },
] satisfies CategoryConfig[];

function localizeSearchStatus(status: string) {
  if (status === "No results found") {
    return "没有找到结果";
  }

  const count = status.match(/^(\d+) results? found\./)?.[1];
  return count ? `找到 ${count} 个结果。使用上下方向键浏览。` : status;
}

export function WikiEmojiPickerPanel({
  onSelect,
}: {
  onSelect: (emoji: string) => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    const searchContainer = panel.querySelector<HTMLElement>(
      ".epr-search-container",
    );
    const skinToneContainer =
      panel.querySelector<HTMLElement>(".epr-skin-tones");
    const skinToneSelect = panel.querySelector<HTMLElement>(
      ".epr-skin-tone-select",
    );

    const syncSearchAccessibility = () => {
      searchContainer
        ?.querySelector<HTMLInputElement>(
          'input[aria-controls="epr-search-id"]',
        )
        ?.setAttribute("aria-label", "搜索 Emoji");

      const status = searchContainer?.querySelector<HTMLElement>(
        ".epr-status-search-results",
      );
      const currentStatus = status?.textContent?.trim();
      if (!status || !currentStatus) return;

      const localizedStatus = localizeSearchStatus(currentStatus);
      if (localizedStatus !== currentStatus) {
        status.textContent = localizedStatus;
      }
    };

    const syncSkinToneAccessibility = () => {
      const buttons = Array.from(
        panel.querySelectorAll<HTMLButtonElement>(".epr-tone"),
      );
      if (!buttons.length || !skinToneContainer) return;

      const isOpen = buttons.some((button) => {
        const offset = button.style.transform.match(
          /translateX\((-?\d+)px\)/,
        )?.[1];
        return offset !== undefined && Number(offset) !== 0;
      });

      skinToneContainer.dataset.skinToneOpen = String(isOpen);
      skinToneSelect?.setAttribute("role", "group");
      skinToneSelect?.setAttribute("aria-label", "选择肤色");

      for (const button of buttons) {
        const label =
          SKIN_TONE_LABELS.find(([className]) =>
            button.classList.contains(className),
          )?.[1] ?? "默认";
        const isActive = button.classList.contains("epr-active");

        button.setAttribute("aria-label", `肤色：${label}`);
        button.tabIndex = isOpen || isActive ? 0 : -1;

        if (isOpen || isActive) {
          button.removeAttribute("aria-hidden");
        } else {
          button.setAttribute("aria-hidden", "true");
        }

        if (isActive) {
          button.setAttribute("aria-expanded", String(isOpen));
        } else {
          button.removeAttribute("aria-expanded");
        }
      }
    };

    syncSearchAccessibility();
    syncSkinToneAccessibility();
    panel
      .querySelector<HTMLElement>(".epr-category-nav")
      ?.setAttribute("aria-label", "Emoji 分类");

    const searchObserver = new MutationObserver(syncSearchAccessibility);
    if (searchContainer) {
      searchObserver.observe(searchContainer, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    }

    const skinToneObserver = new MutationObserver(syncSkinToneAccessibility);
    if (skinToneSelect) {
      skinToneObserver.observe(skinToneSelect, {
        attributes: true,
        attributeFilter: ["aria-pressed", "class", "style"],
        subtree: true,
      });
    }

    return () => {
      searchObserver.disconnect();
      skinToneObserver.disconnect();
    };
  }, []);

  return (
    <div
      ref={panelRef}
      data-testid="wiki-emoji-picker"
      className="wiki-emoji-picker"
    >
      <EmojiPicker
        emojiData={emojiDataZh}
        emojiStyle={EmojiStyle.NATIVE}
        theme={Theme.AUTO}
        suggestedEmojisMode={SuggestionMode.RECENT}
        categories={CATEGORIES}
        searchPlaceholder="筛选…"
        searchClearButtonLabel="清除搜索"
        skinTonePickerLocation={SkinTonePickerLocation.SEARCH}
        previewConfig={{ showPreview: false }}
        lazyLoadEmojis
        autoFocusSearch={false}
        width="100%"
        height="var(--wiki-emoji-picker-height)"
        className="wiki-emoji-picker-library"
        onEmojiClick={({ emoji }) => onSelect(emoji)}
      />
    </div>
  );
}
