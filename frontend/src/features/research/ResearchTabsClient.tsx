"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { RESEARCH_DETAIL_PARAMS } from "./ResearchDetailShell";
import ResearchTabs from "./ResearchTabs";
import { TabType } from "./Research.type";

interface ResearchTabsClientProps {
	activeTab: TabType;
}

export default function ResearchTabsClient({
	activeTab,
}: Readonly<ResearchTabsClientProps>) {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();

	const handleTabChange = (tab: TabType) => {
		const params = new URLSearchParams(searchParams.toString());
		for (const detailParam of RESEARCH_DETAIL_PARAMS) {
			params.delete(detailParam);
		}
		params.set("tab", tab);
		const nextUrl = `${pathname}?${params.toString()}`;
		if (tab === activeTab) {
			window.history.pushState(null, "", nextUrl);
			return;
		}
		router.replace(nextUrl, { scroll: false });
	};

	return <ResearchTabs activeTab={activeTab} onTabChange={handleTabChange} />;
}

