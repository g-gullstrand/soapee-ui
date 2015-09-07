import _ from 'lodash';
import React from 'react';
import Reflux from 'reflux';

import authStore from 'stores/auth';
import recipeJournalsStore from 'stores/recipeJournals';

import RecipeJournalAdd from 'components/recipeJournalAdd';
import RecipeJournalItem from 'components/recipeJournalItem';

export default React.createClass( {

    mixins: [
        Reflux.connect( recipeJournalsStore, 'journals' )
    ],

    render() {
        return (
            <div className="recipe-journals">
                { this.isMyRecipe() &&
                    <RecipeJournalAdd
                        recipe={ this.props.recipe }
                        />
                }

                { _.get( this.state.journals, 'length' ) > 0 && <legend>Latest Journal Entries</legend> }
                { _.map( this.state.journals, this.renderJournal ) }

            </div>
        );
    },

    renderJournal( recipeJournal ) {
        return (
            <RecipeJournalItem
                recipe={ this.props.recipe }
                recipeJournal={ recipeJournal }
                />
        );
    },

    isMyRecipe() {
        return authStore.isAuthenticated()
            && authStore.isMyId( this.props.recipe.user_id );
    }

} );