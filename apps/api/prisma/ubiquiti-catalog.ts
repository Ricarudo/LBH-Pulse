import type { Prisma } from "../src/generated/prisma/client";

const catalogNote =
  "Imported from the public Ubiquiti US Store on 2026-07-10. The public retail price is used for both cost and sell price because distributor cost is not published.";

function catalogItem(input: {
  name: string;
  description: string;
  partNumber: string;
  category: string;
  subcategory: string;
  price: number;
  primaryImageUrl: string;
  productUrl: string;
}): Prisma.ItemCreateManyInput {
  return {
    name: input.name,
    description: input.description,
    itemType: "PRODUCT",
    status: "ACTIVE",
    sku: input.partNumber,
    partNumber: input.partNumber,
    manufacturer: "Ubiquiti",
    brand: "UniFi",
    category: input.category,
    subcategory: input.subcategory,
    unitOfMeasure: "each",
    cost: input.price,
    sellPrice: input.price,
    markupPercent: 0,
    taxable: true,
    primaryImageUrl: input.primaryImageUrl,
    productUrl: input.productUrl,
    internalNotes: catalogNote,
    quoteDescription: input.description,
    defaultLaborHours: 0
  };
}

export const ubiquitiCatalogItems: Prisma.ItemCreateManyInput[] = [
  catalogItem({
    name: "Dream Machine Pro",
    description:
      "10G Cloud Gateway with 100+ UniFi device / 1,000+ client support and 3.5 Gbps IPS routing.",
    partNumber: "UDM-Pro",
    category: "Networking",
    subcategory: "Cloud Gateways",
    price: 379,
    primaryImageUrl:
      "https://cdn.ecomm.ui.com/products/9df27ed4-c4ae-471a-8982-f5b0650da76a/2ede4300-385f-4043-8d96-e0400a22465f.png",
    productUrl:
      "https://store.ui.com/us/en/category/cloud-gateways-large-scale/products/udm-pro"
  }),
  catalogItem({
    name: "Cloud Gateway Ultra",
    description:
      "Compact Cloud Gateway with 30+ UniFi device / 300+ client support, 1 Gbps IPS routing, and multi-WAN load balancing.",
    partNumber: "UCG-Ultra",
    category: "Networking",
    subcategory: "Cloud Gateways",
    price: 129,
    primaryImageUrl:
      "https://cdn.ecomm.ui.com/products/8d2d9e4b-89f3-49a1-9c17-5d774c0067b4/2e179331-f85a-4bc9-bf3e-d00192522732.png",
    productUrl:
      "https://store.ui.com/us/en/category/cloud-gateways-compact/products/ucg-ultra"
  }),
  catalogItem({
    name: "Dream Router 7",
    description:
      "Desktop 10G Cloud Gateway with integrated WiFi 7, PoE switch, microSD storage, and full UniFi application support.",
    partNumber: "UDR7",
    category: "Networking",
    subcategory: "Cloud Gateways",
    price: 279,
    primaryImageUrl:
      "https://cdn.ecomm.ui.com/products/5fd748ec-76b6-48ca-9256-9fb09d50b4b0/c57b6e85-cf5b-48c8-9e92-9f25e4dd0f39.png",
    productUrl:
      "https://store.ui.com/us/en/category/cloud-gateways-wifi-integrated/products/udr7"
  }),
  catalogItem({
    name: "Pro Max 24 PoE",
    description:
      "A 24-port, Layer 3 Etherlighting™ switch capable of high-power PoE++ output.",
    partNumber: "USW-Pro-Max-24-PoE",
    category: "Networking",
    subcategory: "Switching",
    price: 799,
    primaryImageUrl:
      "https://cdn.ecomm.ui.com/products/58922518-88f6-4c75-89c1-f57ba3d8253a/797246c6-70eb-4606-be9a-77515ac74451.png",
    productUrl:
      "https://store.ui.com/us/en/category/switching-professional-max-xg/products/usw-pro-max-24-poe"
  }),
  catalogItem({
    name: "Standard 24 PoE",
    description:
      "A 24-port, Layer 2 PoE switch with a fanless cooling system.",
    partNumber: "USW-24-POE",
    category: "Networking",
    subcategory: "Switching",
    price: 379,
    primaryImageUrl:
      "https://cdn.ecomm.ui.com/products/467359c4-e5c3-487b-ae00-f6b7de29c6fc/1fd41f67-8fd9-4689-989e-c03b43217e3a.png",
    productUrl:
      "https://store.ui.com/us/en/category/switching-standard/products/usw-24-poe"
  }),
  catalogItem({
    name: "Aggregation",
    description: "An 8-port, Layer 2 switch made for 10G SFP+ connections.",
    partNumber: "USW-Aggregation",
    category: "Networking",
    subcategory: "Switching",
    price: 269,
    primaryImageUrl:
      "https://cdn.ecomm.ui.com/products/1c748fb1-b4df-43ef-83e0-d5ed26f9db7c/b06fde87-241d-4b4e-8319-8d7d29f6f6c2.png",
    productUrl:
      "https://store.ui.com/us/en/category/switching-aggregation/products/usw-aggregation"
  }),
  catalogItem({
    name: "Flex Mini 2.5G",
    description:
      "Compact, 5-port 2.5G switch that can be powered with PoE or a USB-C adapter.",
    partNumber: "USW-Flex-2.5G-5",
    category: "Networking",
    subcategory: "Switching",
    price: 49,
    primaryImageUrl:
      "https://cdn.ecomm.ui.com/products/50830d51-4d7e-47ea-92f4-11043d3d664f/c956d05e-4351-46ba-b71e-afaafa3f1144.png",
    productUrl:
      "https://store.ui.com/us/en/category/switching-utility/products/usw-flex-2-5g-5"
  }),
  catalogItem({
    name: "E7",
    description:
      "Enterprise-grade indoor access point with 10-stream WiFi 7 performance, a 10 GbE uplink, and a redundant GbE port for high availability.",
    partNumber: "E7",
    category: "Networking",
    subcategory: "Wireless Access Points",
    price: 499,
    primaryImageUrl:
      "https://cdn.ecomm.ui.com/products/93ae773e-8969-4889-8591-2c227a31ac3f/09ff1a3a-0ce6-43ad-8188-607086944059.png",
    productUrl: "https://store.ui.com/us/en/category/wifi-enterprise/products/e7"
  }),
  catalogItem({
    name: "U7 Pro Max",
    description:
      "Ceiling-mounted WiFi 7 AP with 8 spatial streams, 6 GHz support, and a dedicated spectral scanning engine for interference-free WiFi in demanding, large-scale environments.",
    partNumber: "U7-Pro-Max",
    category: "Networking",
    subcategory: "Wireless Access Points",
    price: 279,
    primaryImageUrl:
      "https://cdn.ecomm.ui.com/products/350070a0-ae43-431b-b052-8e849c3b0a75/bad94693-bc54-4ab4-b060-9b972401941c.png",
    productUrl:
      "https://store.ui.com/us/en/category/wifi-flagship/products/u7-pro-max"
  }),
  catalogItem({
    name: "U7 In-Wall",
    description:
      "Wall-mounted WiFi 7 AP with 4 spatial streams and an integrated 2.5 GbE PoE switch designed for hospitality environments.",
    partNumber: "U7-IW",
    category: "Networking",
    subcategory: "Wireless Access Points",
    price: 149,
    primaryImageUrl:
      "https://cdn.ecomm.ui.com/products/9ea6158e-bc26-4ac7-946a-55eca465b059/566b1098-3514-46b6-8aee-4fde454d1205.png",
    productUrl: "https://store.ui.com/us/en/category/wifi-wall/products/u7-iw"
  }),
  catalogItem({
    name: "U7 Pro Outdoor",
    description:
      "All-weather IP67 WiFi 7 AP with 6 spatial streams, extended-range AFC 6 GHz support, integrated directional super antenna, and articulation mounting bracket.",
    partNumber: "U7-Pro-Outdoor",
    category: "Networking",
    subcategory: "Wireless Access Points",
    price: 279,
    primaryImageUrl:
      "https://cdn.ecomm.ui.com/products/29714d60-88e2-482c-aded-e0c456b51f98/277445cb-7d35-4be0-b267-1331067895bf.png",
    productUrl:
      "https://store.ui.com/us/en/category/wifi-outdoor/products/u7-pro-outdoor-us"
  }),
  catalogItem({
    name: "AI LPR",
    description:
      "Specialized 4K camera with 3x optical zoom and long-range IR night vision optimized for recognizing license plates on vehicles moving up to 90 km/h.",
    partNumber: "UVC-AI-LPR",
    category: "CCTV / Surveillance",
    subcategory: "Cameras",
    price: 499,
    primaryImageUrl:
      "https://cdn.ecomm.ui.com/products/ad7cda21-71d0-4d92-a97e-93a0050b15ff/1fc68e16-2c0a-42bc-91ed-2b9e01a15316.png",
    productUrl:
      "https://store.ui.com/us/en/category/physical-security-bullet/products/uvc-ai-lpr"
  }),
  catalogItem({
    name: "G6 Instant",
    description:
      "Plug-and-play, 4K WiFi-connected camera with a 1/1.8\" 8MP image sensor, Multi-TOPS AI Engine, and two-way audio.",
    partNumber: "UVC-G6-INS",
    category: "CCTV / Surveillance",
    subcategory: "Cameras",
    price: 179,
    primaryImageUrl:
      "https://cdn.ecomm.ui.com/products/16382cd9-95ca-4c26-ae58-3f2cf02c8b75/ac0e2657-769a-4921-ab11-c4eaa9584c13.png",
    productUrl:
      "https://store.ui.com/us/en/category/physical-security-compact/products/uvc-g6-ins"
  }),
  catalogItem({
    name: "Network Video Recorder Pro",
    description:
      "A 2U-sized video recorder with (7) 2.5/3.5\" HDD bays that can provide up to 60 days of storage for (24) 4K cameras or (70) Full HD cameras.",
    partNumber: "UNVR-Pro",
    category: "CCTV / Surveillance",
    subcategory: "Network Video Recorders",
    price: 499,
    primaryImageUrl:
      "https://cdn.ecomm.ui.com/products/5692c483-9bbf-4ad1-a80a-11e29e1adc3e/d31bf89f-c6b2-4cca-a0dc-b65032046da6.png",
    productUrl:
      "https://store.ui.com/us/en/category/physical-security-nvr/products/unvr-pro"
  }),
  catalogItem({
    name: "Network Video Recorder",
    description:
      "A video recorder with (4) 2.5/3.5\" HDD bays that can support up to 30 days of storage for (18) 4K cameras or (60) Full HD cameras.",
    partNumber: "UNVR",
    category: "CCTV / Surveillance",
    subcategory: "Network Video Recorders",
    price: 299,
    primaryImageUrl:
      "https://cdn.ecomm.ui.com/products/8a3b51c6-d3e9-4ea7-95b3-49a1253c4542/b35900e8-c2e4-41d7-82e4-e40f1534c399.png",
    productUrl:
      "https://store.ui.com/us/en/category/physical-security-nvr/products/unvr"
  }),
  catalogItem({
    name: "Retrofit Hub",
    description:
      "DC-powered hub that supports Wiegand and OSDP readers and provides entry and exit control for up to two doors.",
    partNumber: "UA-Retrofit-Hub-2",
    category: "Access Control",
    subcategory: "Hubs",
    price: 229,
    primaryImageUrl:
      "https://cdn.ecomm.ui.com/products/f84db3e4-fd4e-466e-970e-018ee7c3db08/b42a534d-81a9-48bb-813d-3cac00ffc9ce.png",
    productUrl:
      "https://store.ui.com/us/en/category/door-access-hub/products/ua-retrofit-hub-2"
  }),
  catalogItem({
    name: "Door Hub",
    description:
      "A single-door mechanism that provides complete entry and exit control via connected Access Readers.",
    partNumber: "UA-Hub-Door",
    category: "Access Control",
    subcategory: "Hubs",
    price: 199,
    primaryImageUrl:
      "https://cdn.ecomm.ui.com/products/90d00ca5-015c-4bc6-b3bd-0d1f8d5bdea3/d37fb6e1-1036-459c-a00c-3b7b2c8cda56.png",
    productUrl:
      "https://store.ui.com/us/en/category/door-access-hub/products/ua-hub-door"
  }),
  catalogItem({
    name: "Access Ultra",
    description:
      "An access reader with a built-in hub for complete, single-door entry control from one device.",
    partNumber: "UA-Ultra",
    category: "Access Control",
    subcategory: "Access Readers",
    price: 129,
    primaryImageUrl:
      "https://cdn.ecomm.ui.com/products/8c23291f-02aa-460a-a9bb-22cdf8cd3d5f/b4949bf1-cd6c-4ff5-8f17-23f3a270c78a.png",
    productUrl:
      "https://store.ui.com/us/en/category/door-access-hub/products/ua-ultra"
  }),
  catalogItem({
    name: "UNAS Pro 4",
    description:
      "1U rack-mount NAS with (4) 2.5/3.5\" HDD bays and (2) M.2 NVMe SSD cache slots, delivering faster access, lower latency, and high-availability 10 Gbps networking for large-scale file storage and sharing.",
    partNumber: "UNAS-Pro-4",
    category: "Storage",
    subcategory: "Network Attached Storage",
    price: 499,
    primaryImageUrl:
      "https://cdn.ecomm.ui.com/products/1e8ea561-a3af-4f50-92b4-b7ef3a37a66a/f9894013-e187-4296-8bf6-ca52271d4d89.png",
    productUrl:
      "https://store.ui.com/us/en/category/network-storage/products/unas-pro-4"
  }),
  catalogItem({
    name: "UPS Tower",
    description:
      "UniFi managed 1kVA uninterruptible power supply with 5 backup outlets, 5 surge outlets, a hot-swappable battery, and a 7-minute half-load runtime.",
    partNumber: "UPS-Tower",
    category: "Power / UPS",
    subcategory: "Uninterruptible Power Supplies",
    price: 159,
    primaryImageUrl:
      "https://cdn.ecomm.ui.com/products/79ba566f-afed-4047-96d5-efdaf848add3/0374750d-d450-4268-9a23-784b29c70d91.png",
    productUrl:
      "https://store.ui.com/us/en/category/integrations-power-tech/products/ups-tower-us"
  }),
  catalogItem({
    name: "UniFi 5G Backup",
    description:
      "Compact PoE-powered 5G RedCap antenna system with versatile mounting that plugs into any UniFi PoE port to provide automatic internet backup.",
    partNumber: "U5G",
    category: "Networking",
    subcategory: "Cellular Backup",
    price: 99,
    primaryImageUrl:
      "https://cdn.ecomm.ui.com/products/16d7be10-30f2-41f7-a355-071ed972683a/05fdd39b-3f46-4a1d-bdde-6a044de1a224.png",
    productUrl:
      "https://store.ui.com/us/en/category/internet-solutions/products/u5g-us"
  })
];
