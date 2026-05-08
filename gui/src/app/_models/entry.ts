export type Entry = {
    bill_of_materials_entry_id: number;
    quote_id: number;
    item_id: number;
    quantity: number;
    description: string;
    unit: number;
  }

  export type LaborCost = {
    labor_cost_id: number;
    workers: number,
    hours: number,
    costWorker: number,
    extCost: number,
    unitCost: number,
    ratio: number,
    totalCost: 0
  }