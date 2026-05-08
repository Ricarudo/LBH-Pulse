



export class ChartDataResponse {
    
    type: string;
    labels: string[];
    datasets: any[];
    
    constructor(type: string, labels: string[], datasets: any[], data_buckets?: string[], label_param?: string, data_param?: string, colors?: string[]){
        this.type = type;
        this.labels = data_buckets ?? labels;//label for bucket of data
        this.datasets = this.formatQuoteSets(datasets, colors);
    }

    formatQuoteSets(datasets: any[], cols?: string[]){
        let colors: string[] = cols ?? ['#ff0266', '#ff0000','#00ff00', '#0000ff', "#bc2a8d"] 
        const d = [];
        let i  =0;
        for(let [l, value] of datasets)
        {
            d.push({
                label: [l],//label for data points
                fill: 'true',
                backgroundColor: colors.length == datasets.length ? colors[i] :[colors[Math.floor(Math.random() * 100) % (colors.length-1)]],
                data: [value as number],//data points
            })

            i+=1;
        }

        return d;
    }

    formatDataSets(datasets: any[], param: string, data_param: string){
        let colors: string[] = ['#ff0266', '#ff0000','#00ff00', '#0000ff', '#000000'] ;
        const d = [];

        for(let entry of datasets)
        {
            d.push({
                label: [data_param],//title for chart
                fill: 'false',
                borderColor: colors[Math.floor(Math.random() * 100) % (colors.length-1)],
                backgroundColor: colors[Math.floor(Math.random() * 100) % (colors.length-1)],
                data: [entry[data_param] as number],
            })
        }

        return d;
    }

    toJSON(){
        return {
            type: this.type,
            data: {
                labels: this.labels,//labels to pair data points to
                datasets: this.datasets
            }
        }
    }

}

export class ChartOptions {
    title: string;
    legend: boolean;
    responsive: boolean;
    maintainAspectRatio: boolean;

    constructor(legend: boolean, responsive: boolean, ratio: boolean, title?: string){
        this.title = title ?? '';
        this.legend = legend;
        this.responsive = responsive;
        this.maintainAspectRatio = ratio;
    }

    toJSON(){
        return {
            title: {
                text: this.title != '' ?  this.title : '' ,
                display : this.title == '' ? false : true,
            },
            legend: {
                display: this.legend
            },
            responsive: this.responsive,
            maintainAspectRatio: this.maintainAspectRatio,
            scales: {
                xAxes : [{ display: true, gridLines: {
                    display:true
                } }],
                yAxes : [{ display: true , gridLines: {
                    display:true
                } } ]
            }
        }
    }
}
