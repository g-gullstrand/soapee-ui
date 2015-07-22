import _ from 'lodash';
import { EventEmitter } from 'events';

import oilsStore from 'stores/oils';

export default class extends EventEmitter {

    constructor() {
        super();

        this.recipe = {
            name: '',
            description: '',
            notes: '',

            oils: [],
            weights: {},
            recipe: {},

            soapType: 'noah',
            kohPurity: 90,
            uom: 'gram',
            totalWeight: 500,
            totalUom: 'gram',
            superFat: 5,
            waterRatio: 38
        };
    }

    setRecipe( recipe ) {
        this.recipe = _.merge( {}, this.recipe, recipe );
    }

    setRecipeValue( key, value ) {
        _.set( this.recipe, key, value );
    }

    getRecipeValue( key ) {
        return _.get( this.recipe, key );
    }

    recipe() {
        return this.recipe;
    }

    isPercentRecipe() {
        return this.recipe.uom === 'percent';
    }

    isKohRecipe() {
        return this.recipe.soapType === 'koh';
    }

    sapForSoapType( oil ) {
        let factors = {
            koh: ( this.recipe.kohPurity / 100 ),
            noah: 1.403
        };

        return oil.sap / factors[ this.recipe.soapType ];
    }

    setRecipeOilsByIds( oilIds ) {
        let existingOilsIds = _.pluck( this.recipe.oils, 'id' );
        let toRemoveOilsIds = _.difference( existingOilsIds, oilIds );
        let toKeepIds = _.intersection( existingOilsIds, oilIds );
        let toAdd = _.difference( oilIds, toKeepIds );

        _.each( toRemoveOilsIds, oilId => {
            let oil = _.find( this.recipe.oils, { id: Number( oilId ) } );
            this.removeOil( oil, true );
        } );

        _.each( toAdd, oilId => {
            let oil = oilsStore.getOilById( oilId );
            this.addOil( oil, true );
        } );

        this.calculateRecipe();
        this.emit( 'calculated' );
    }

    addOil( oil, skipUpdate = false ) {
        this.recipe.oils = _.union( this.recipe.oils, [ oil ] );

        if ( skipUpdate === false ) {
            this.calculateRecipe();
            this.emit( 'calculated' );
        }
    }

    removeOil( oil, skipUpdate = false ) {
        this.recipe.oils = _.without( this.recipe.oils, oil );
        delete this.recipe.weights[ oil.id ];

        if ( skipUpdate === false ) {
            this.calculateRecipe();
            this.emit( 'calculated' );
        }
    }

    getOilWeight( oil ) {
        return this.recipe.weights[ oil.id ] || '';
    }

    setOilWeight( oil, weight ) {
        //accepts numeric only
        if ( _.isFinite( Number( weight ) ) || weight === '.' ) {
            this.recipe.weights[ oil.id ] = weight;

            this.calculateRecipe();
            this.emit( 'calculated' );
        }
    }

    recipeOilsUom() {
        if ( this.isPercentRecipe() ) {
            return this.recipe.totalUom;
        } else {
            return this.recipe.uom;
        }
    }


    recipeOilsWeightsRatios() {
        let totalOilWeight;

        if ( this.isPercentRecipe() ) {
            totalOilWeight = this.recipe.totalWeight;
        } else {
            totalOilWeight = _.get( this.recipe, 'summary.totals.totalOilWeight' );
        }

        if ( totalOilWeight ) {
            return _.map( this.recipe.weights, ( weightOrRation, oilId ) => {
                let oil;
                let ratio;
                let weight;

                oil = _.find( this.recipe.oils, { id: Number( oilId ) } );

                if ( this.isPercentRecipe() ) {
                    ratio = weightOrRation / 100;
                    weight = totalOilWeight * ratio;
                } else {
                    ratio = weightOrRation / totalOilWeight;
                    weight = weightOrRation;
                }

                return {
                    oil,
                    ratio,
                    weight
                };
            } );
        }
    }


    sumWeights() {
        return _.sum( this.recipe.weights );
    }

    countWeights() {
        return _.filter( this.recipe.weights, ( weight ) => {
            return Number( weight ) > 0;
        } ).length;
    }

    countOils() {
        return this.recipe.oils.length;
    }

    calculateRecipe() {
        let totalOilWeight;
        let totalWaterWeight;
        let totalLye;
        let totalBatchWeight;
        let lyeConcentration;
        let waterLyeRatio;

        let breakdowns;
        let properties;
        let saturations;

        //total weights either % ratios or uoms
        if ( this.isPercentRecipe() ) {
            totalOilWeight = this.recipe.totalWeight;
        } else {
            totalOilWeight = this.sumWeights();
        }

        totalWaterWeight = totalOilWeight * ( this.recipe.waterRatio / 100 );
        totalLye = _.sum( this.recipe.weights, ( weightOrRatio, oilId ) => {
            return this.lyeWeightForOilId( weightOrRatio, oilId );
        } );
        totalBatchWeight = Number( totalOilWeight ) + Number( totalWaterWeight ) + Number( totalLye );

        if ( totalWaterWeight + totalLye ) {
            lyeConcentration = 100 * (totalLye / ( totalWaterWeight + totalLye ));
            waterLyeRatio = totalWaterWeight / totalLye;

            breakdowns = this.recipeOilFatBreakdowns();
            properties = this.recipeOilProperties();
            saturations = this.recipeOilSaturations();
        }

        this.recipe.summary = {
            totals: {
                totalOilWeight,
                totalWaterWeight,
                totalLye,
                totalBatchWeight,
                lyeConcentration,
                waterLyeRatio
            },
            breakdowns,
            properties,
            saturations
        };
    }

    lyeWeightForOilId( weightRatio, oilId ) {
        if ( weightRatio ) {
            let oilWeight;
            let oil;
            let grams;
            let lyeGrams;

            if ( this.isPercentRecipe() ) {
                oilWeight = this.recipe.totalWeight * ( weightRatio / 100 );
            } else {
                oilWeight = weightRatio;
            }

            grams = this.convertToGrams( oilWeight );
            oil = _.find( this.recipe.oils, { id: Number( oilId ) } );
            lyeGrams = this.sapForSoapType( oil ) * grams;

            //factor in superfat discount
            lyeGrams = lyeGrams - _.round( ( this.recipe.superFat / 100 ) * lyeGrams, 3 );

            return this.convertToUom( lyeGrams );
        } else {
            return 0;
        }
    }

    convertToGrams( weightOrRatio ) {
        return weightOrRatio * this.conversions()[ this.uomToUse() ];
    }

    convertToUom( grams ) {
        return grams / this.conversions()[ this.uomToUse() ];
    }

    uomToUse() {
        if ( this.isPercentRecipe() ) {
            return this.recipe.totalUom;
        } else {
            return this.recipe.uom;
        }
    }

    conversions() {
        return {
            gram: 1,
            kilo: 0.001,
            pound: 0.00220462,
            ounce: 0.035274
        };
    }

    oilsToRatioIterator( block ) {
        let total;

        total = this.sumWeights();

        _.each( this.recipe.weights, ( weightOrRation, oilId ) => {
            let oil;
            let ratio;

            if ( this.isPercentRecipe() ) {
                ratio = weightOrRation / 100;
            } else {
                ratio = weightOrRation / total;
            }

            oil = _.find( this.recipe.oils, { id: Number( oilId ) } );

            block( oil, ratio );
        }, this );
    }

    recipeOilProperties() {
        return _.tap( {}, result => {
            this.oilsToRatioIterator( ( oil, ratio ) => {
                _.each( oil.properties, ( value, key ) => {
                    result[ key ] = ( result[ key ] || 0 ) + oil.properties[ key ] * ratio;
                } );
                _.each( [ 'iodine', 'ins' ], key => {
                    result[ key ] = ( result[ key ] || 0 ) + oil[ key ] * ratio;
                } );
            } );
        } );
    }

    recipeOilFatBreakdowns() {
        return _.tap( {}, result => {
            this.oilsToRatioIterator( ( oil, ratio ) => {
                _.each( oil.breakdown, ( acidRatio, fattyAcid ) => {
                    result[ fattyAcid ] = ( result[ fattyAcid ] || 0 ) + acidRatio * ratio;
                } );
            } );
        } );
    }


    recipeOilSaturations() {
        return _.tap( {}, result => {
            this.oilsToRatioIterator( ( oil, ratio ) => {
                _.each( oil.breakdown, ( acidRatio, fattyAcid ) => {
                    let classification = this.classifyFattyType( fattyAcid );
                    result[ classification ] = ( result[ classification ] || 0 ) + acidRatio * ratio;
                } );
            } );
        } );
    }

    classifyFattyType( fattyAcid ) {
        let types = {
            caprylic: 'saturated',
            capric: 'saturated',
            lauric: 'saturated',
            myristic: 'saturated',
            palmitic: 'saturated',
            stearic: 'saturated',
            ricinoleic: 'unsaturated',
            oleic: 'unsaturated',
            linoleic: 'unsaturated',
            linolenic: 'unsaturated',
            eicosenoic: 'unsaturated',
            docosenoid: 'unsaturated',
            erucic: 'unsaturated',
            docosadienoic: 'unsaturated'
        };

        return types[ fattyAcid ];
    }

    soapTypeToLye() {
        return {
            noah: 'NaOH',
            koh: 'KOH'
        }[ this.recipe.soapType ];
    }

}