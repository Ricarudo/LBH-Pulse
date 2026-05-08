import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { protectedResources } from '../auth-config';
import { FormArray } from '@angular/forms';
import { ServerError } from '@azure/msal-common';

@Injectable({
    providedIn: 'root'
})
export class CostCalculator{

    //TODO Create table with 
    FSE_PERCENT = 0.016;
    OVERHEAD_PROFIT_MARGIN = 0.5;
    LABOR_CONTINGENCY_PERCENT = 0.1;
    PAYROLL_BURDEN_PERCENT = 0.2;
    OVERHEAD_PROFIT = 0.5;
    //MATERIAL COST VALUES
    FREIGHT_PERCENT = .05;
    CONT_PERCENT = .1;
    TAXES_PERCENT = .115;
    PROFIT_PERCENT = .75;
    
    itemAmount = 0;

    adminDetails =[
    {   
        name: "Ops Supt",
        percent:.1,
        rate:1000
    },
    {   
        name: "Supt",
        percent:.15,
        rate:790
    },
    {   
        name: "Supv",
        percent:.5,
        rate:600
    },
    {   
        name: "Mktg",
        percent:.05,
        rate:500
    },
    {   
        name: "Runner",
        percent:.05,
        rate:400
    },
    {   
        name: "Admin",
        percent:.1,
        rate:500
    },
    {   
        name: "Whse",
        percent:.05,
        rate:400
    }
    ];
   
    //Calculated Variables
    totalWorkers = 0;
    avgWorkerAmount = 0;
    totalHours = 0;
    totalExitCost = 0;
    projectLengthHours =0;
    adminCost = 0;
    payrollBurden = 0;
    payrollTotal = 0;
    overheadTotal = 0;
    overheadProfit = 0;
    //Overhead Expenses
    covidExpense = 17.5;
    lodgingExpense = 0;
    perDiemExpense = 0;
    vehicleExpense = 100;
    rentExpense = 1385.62;
    fbiExpense = 346.16;
    expensesTotal = 0;
    

    //Return Values
    ratio = 0;
    totalMaterialExitCost = 0;
    totalLaborExitCost = 0;







    calcLaborCost(laborArray: FormArray){
        this.itemAmount = laborArray.length;
        console.log(this.itemAmount);
        this.totalHours = 0;
        this.totalWorkers = 0;
        this.totalExitCost = 0;
        this.projectLengthHours = 0;
        this.adminCost = 0;
        this.payrollBurden = 0;
        this.payrollTotal = 0;
        this.expensesTotal = 0;
        this.overheadTotal = 0;
        this.totalLaborExitCost =0;

        for(let control of laborArray.controls){
           
            
            const totalUnitHours = control.get('quantity')?.value * control.get('workers')?.value / control.get('unitHours')?.value // Total Unit Hours = QTY[i] * Unit Hours[i] (The amount of time needed for the install of all the units of item)
            
            const itemExitCost = totalUnitHours * control.get("rate")?.value; //
            control.get("total")?.setValue((control.get("unitHours")?.value * control.get("rate")?.value * control.get("workers")?.value), {emitEvent:false});
            
            this.totalWorkers = this.totalWorkers + control.get('workers')?.value
            this.totalHours = this.totalHours + totalUnitHours
            this.totalExitCost = this.totalExitCost + itemExitCost;


        }

        this.avgWorkerAmount = this.totalWorkers / this.itemAmount;
        this.projectLengthHours = this.totalHours / this.avgWorkerAmount

        //Supervison Cost Calculation = All Admin Costs.

        for (let i = 0; i < this.adminDetails.length; i++){
            console.log("-----Admin Cost Breakdown of" + this.adminDetails[i].name + "is a total of= " +this.projectLengthHours/40 * this.adminDetails[i].percent * this.adminDetails[i].rate)
            this.adminCost = this.adminCost + (this.projectLengthHours/40 * this.adminDetails[i].percent * this.adminDetails[i].rate)
        }

        //Now we calculate the Payroll Burden
        this.payrollBurden = this.adminCost + this.totalExitCost * this.PAYROLL_BURDEN_PERCENT;

        //Calculate Payroll total

        this.payrollTotal = this.payrollBurden + this.totalExitCost + this.adminCost;
        this.payrollTotal = this.payrollTotal * this.LABOR_CONTINGENCY_PERCENT + this.payrollTotal;

        //Calculate Expenses Total
        this.expensesTotal = this.covidExpense * (this.projectLengthHours/8) * Math.ceil(this.avgWorkerAmount)+
                                this.vehicleExpense * (this.projectLengthHours / 40) +
                                this.rentExpense * (this.projectLengthHours / 40) +
                                this.fbiExpense * (this.projectLengthHours / 40) +
                                this.lodgingExpense * (this.projectLengthHours/8) * Math.ceil(this.avgWorkerAmount)+
                                this.perDiemExpense * (this.projectLengthHours/8) * Math.ceil(this.avgWorkerAmount);


        //Calculate Overhead Total
        this.overheadTotal = this.expensesTotal + this.payrollTotal;
        this.overheadTotal = this.overheadTotal * this.OVERHEAD_PROFIT + this.overheadTotal;
        this.overheadTotal = this.overheadTotal * this.FSE_PERCENT + this.overheadTotal; //Total Labor Cost



        //Calculate Ratio
        this.ratio = this.overheadTotal / this.totalExitCost;

        for(let control of laborArray.controls){

            const totalUnitHours = control.get('quantity')?.value * control.get('workers')?.value / control.get('unitHours')?.value // Total Unit Hours = QTY[i] * Unit Hours[i] (The amount of time needed for the install of all the units of item)
            const itemExitCost = totalUnitHours * control.get("rate")?.value;

            control.get("unitLaborCost")?.setValue(this.ratio * itemExitCost, {emitEvent:false});
            this.totalLaborExitCost = this.totalLaborExitCost + this.ratio * itemExitCost;

        }

        
        console.log("---------------------------------------------------");
        console.log("The amount of workers is " + this.totalWorkers);
        console.log("The average amount of workers is " + this.avgWorkerAmount);
        console.log("The Total Hours of the Project is " + this.totalHours);
        console.log("The Total Exit Cost of the Project is " + this.totalExitCost);
        console.log("Total Project Length is " + this.projectLengthHours);
        console.log("Total Administrative Cost is " + this.adminCost);
        console.log("Total Payroll Cost is " + this.payrollTotal);
        console.log("Total Expenses Cost is " + this.expensesTotal);
        console.log("Total Overhead Cost is " + this.overheadTotal);
        console.log("Project Ratio " + this.ratio);
        console.log("-------------------------END-------------------------");
        return this.totalLaborExitCost;

    }

    calcMaterialCost(laborArray: FormArray){
        this.totalMaterialExitCost = 0;
        
        for(let control of laborArray.controls){

            var materialExitCost =  control.get('quantity')?.value * control.get('materialCost')?.value // Total Unit Hours = QTY[i] * Unit Hours[i] (The amount of time needed for the install of all the units of item)
            control.get("freight")?.setValue(materialExitCost * this.FREIGHT_PERCENT , {emitEvent:false});
            control.get("contingency")?.setValue(materialExitCost * this.CONT_PERCENT , {emitEvent:false});
            control.get("taxes")?.setValue(materialExitCost * this.TAXES_PERCENT, {emitEvent:false});
            control.get("profit")?.setValue(materialExitCost / this.PROFIT_PERCENT - materialExitCost, {emitEvent:false});
            const totalUnitExitCost = materialExitCost + control.get('freightPercent')?.value + control.get('contingencyPercent')?.value + control.get('taxes')?.value + control.get('profitMarkup')?.value
            control.get("exitMaterialCost")?.setValue( totalUnitExitCost, {emitEvent:false});
            this.totalMaterialExitCost = this.totalMaterialExitCost + totalUnitExitCost;
           

        }
        console.log(this.totalMaterialExitCost)
        return this.totalMaterialExitCost;
    }

    getRatio(){
        return this.ratio
        
    }

}