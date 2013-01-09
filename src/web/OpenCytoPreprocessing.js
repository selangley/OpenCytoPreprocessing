/*
 *  Copyright 2012 Fred Hutchinson Cancer Research Center
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

Ext.namespace('LABKEY', 'LABKEY.ext');

LABKEY.ext.OpenCytoPreprocessing = Ext.extend( Ext.Panel, {

    constructor : function(config) {

        ////////////////////////////////////
        //  Generate necessary HTML divs  //
        ////////////////////////////////////
        $('#' + config.webPartDivId).append(
            '<div id="wpNcdf' + config.webPartDivId + '" class="centered-text"></div>' +

            '<div id="wpSampleGroupsFetching' + config.webPartDivId + '" class="centered-text hidden"></div>' +

            '<div id="wpParse' + config.webPartDivId + '" class="centered-text"></div>' +

            '<ul id="ulList' + config.webPartDivId + '" class="bold-text ulList">' +

                '<li class="liListDefault">' +
                    '<div class="left-text" id="cntXml' + config.webPartDivId + '"></div>' +
                '</li>' +

                '<li class="liListDefault">' +
                    '<div class="left-text" id="cntSampleGroup' + config.webPartDivId + '"></div>' +
                '</li>' +

                '<li class="liListDefault">' +
                    '<div class="left-text" id="cntAnalysisName' + config.webPartDivId + '"></div>' +
                '</li>' +

                '<li class="liListDefault">' +
                    '<div class="left-text" id="cntAnalysisDescription' + config.webPartDivId + '"></div>' +
                '</li>' +

            '</ul>'
        );


        /////////////////////////////////////
        //            Variables            //
        /////////////////////////////////////
        var currentComboId  = undefined,
            rootPath        = undefined,
            maskGlobal      = undefined,
            listStudyVars   = [];

        /////////////////////////////////////
        //             Strings             //
        /////////////////////////////////////
        var strngErrorContactWithLink = ' Please, contact the <a href="mailto:ldashevs@fhcrc.org?Subject=OpenCytoPreprocessing%20Support">developer</a>, if you have questions.'


        /////////////////////////////////////
        //            Close Tool           //
        /////////////////////////////////////
        var closeTool = [{
            id: 'close',
            handler: function(e, target, pnl){
                var toRemove = document.getElementById( pnl.getId() ).parentNode.parentNode;
                toRemove.parentNode.removeChild( toRemove );
            }
        }];


        ///////////////////////////////////
        //            Stores             //
        ///////////////////////////////////
        var strSampleGroup = new Ext.data.ArrayStore({
            autoLoad: false,
            data: [],
            fields: [{ name: 'SampleGroup', type: 'string' }]
        });

        var strXML = new LABKEY.ext.Store({
            autoLoad: true,
            listeners: {
                load: function(){
                    if ( this.getCount() == 0 ){
                        cbXml.disable();
                        tfAnalysisName.disable();
                        pnlWorkspaces.getEl().mask('Seems like you have not imported any XML files, click <a href="' + LABKEY.ActionURL.buildURL('pipeline', 'browse') + '">here</a> to do so.' + strngErrorContactWithLink, 'infoMask');
                    }
                }
            },
            queryName: 'XmlFiles',
            remoteSort: false,
            schemaName: 'exp',
            sort: 'FileName'
        });

        var strngSqlStartTable = 'SELECT DISTINCT FCSFiles.Name AS FileName';
        var strngSqlEndTable =
            ' FROM FCSFiles' +
            ' WHERE FCSFiles.Run.FCSFileCount != 0 AND FCSFiles.Run.ProtocolStep = \'Keywords\'' +
            ' ORDER BY FileName';

        var strFilteredTable = new LABKEY.ext.Store({
            autoLoad: true,
            listeners: {
                load: updateTableStatus
            },
//                    nullRecord: {
//                        displayColumn: 'myDisplayColumn',
//                        nullCaption: '0'
//                    },
            schemaName: 'flow',
            sql: strngSqlStartTable + strngSqlEndTable
        });


        var strStudyVarName = new Ext.data.ArrayStore({
            autoLoad: true,
            data: [],
            fields: ['Flag', 'Display', 'Value'],
            sortInfo: {
                field: 'Flag',
                direction: 'ASC'
            }
        });


        //////////////////////////////////////////////////////////////////
        //             Queries and associated functionality             //
        //////////////////////////////////////////////////////////////////
        LABKEY.Query.selectRows({
            columns: ['RootPath'],
            failure: onFailure,
            queryName: 'RootPath',
            schemaName: 'flow',
            success: function(data){
                var count = data.rowCount;
                if ( count == 1 ){
                    rootPath = data.rows[0].RootPath;
                } else if ( count < 1 ){
                    // disable all
                    btnNext.disable();
                    cbStudyVarName.disable();
                    pnlMain.getEl().mask('Seems like you have not imported any FCS files, click <a href="' + LABKEY.ActionURL.buildURL('pipeline', 'browse') + '">here</a> to do so.' + strngErrorContactWithLink, 'infoMask');
                } else {
                    // disable all
                    btnNext.disable();
                    cbStudyVarName.disable();
                    pnlMain.getEl().mask('Cannot retrieve the path for the data files: it is non-unique.' + strngErrorContactWithLink, 'infoMask');
                }
            }
        });

        function fetchKeywords(){
            LABKEY.Query.selectRows({
                columns: ['Name'],
                filterArray: [
                    LABKEY.Filter.create( 'Name', 'DISPLAY;BS;MS', LABKEY.Filter.Types.CONTAINS_NONE_OF ),
                    LABKEY.Filter.create(
                        'Name',
                        [ '$', 'LASER', 'EXPORT', 'CST', 'CYTOMETER', 'EXPORT',
                            'FJ_', 'CREATOR', 'TUBE NAME', 'WINDOW EXTENSION', 'SPILL' ],
                        LABKEY.Filter.Types.DOES_NOT_START_WITH
                    )
                ],
                queryName: 'Keyword',
                schemaName: 'flow',
                success:
                    function(data){
                        var len = data.rowCount, i, toAdd;
                        for ( i = 0; i < len; i ++ ){
                            toAdd = data.rows[i].Name;
                            listStudyVars.push( [ 'K', toAdd + ' (Keyword)', 'RowId/Keyword/' + toAdd ] );
                        }

                        strStudyVarName.loadData( listStudyVars );
                    },
                failure: onFailure
            });
        }

        LABKEY.Query.getQueries({
            schemaName: 'Samples',
            success: function( queriesInfo ){
                var queries = queriesInfo.queries, count = queries.length, j;
                for ( j = 0; j < count; j ++ ){
                    if ( queries[j].name == 'Samples' ){
                        j = count;
                    }
                }

                if ( j == count + 1 ){
                    LABKEY.Domain.get( function( DomainDesign ) {
                        var array, len, i, toAdd;
                        array = DomainDesign.fields;
                        len = array.length;
                        for ( i = 0; i < len; i ++ ){
                            toAdd = array[i].name;
                            listStudyVars.push( [ 'E', toAdd + ' (External)', 'Sample/' + toAdd ] );
                        }

                        fetchKeywords();

                    }, fetchKeywords, 'Samples', 'Samples' );
                } else {
                    fetchKeywords();
                }
            },
            failure: fetchKeywords
        });


        /////////////////////////////////////
        //     ComboBoxes / TextFields     //
        /////////////////////////////////////
        var cbStudyVarName = new Ext.ux.form.SuperBoxSelect({
            allowBlank: true,
            autoSelect: false,
            displayField: 'Display',
            emptyText: 'Select...',
            forceSelection: true,
            lazyInit: false,
            listeners: {
                additem: function(){
                    updateInfoStatus( 'Set the study variables and click \'Next\'', 1 );
                },
                clear: function(){
                    updateInfoStatus( 'Set the study variables and click \'Next\'' );
                },
                /*focus: function (){ // display the dropdown on focus
                    this.expand();
                },*/
                removeitem: function(){
                    updateInfoStatus( 'Set the study variables and click \'Next\'', 1 );
                }
            },
            minChars: 0,
            mode: 'local',
            resizable: true,
            store: strStudyVarName,
            supressClearValueRemoveEvents : true,
            triggerAction: 'all',
            typeAhead: true,
            valueField: 'Value'
        });

        var lastlySelectedXML;

        var cbXml = new Ext.form.ClearableComboBox({
            allowBlank: true,
            displayField: 'FileName',
            emptyText: 'Select...',
            forceSelection: true,
            listeners: {
                change: function(){
                    // sample groups obtaining logic here?
                    if ( this.getValue() == '' ){
                        cbSampleGroup.setDisabled(true);
                        btnProcess.setDisabled(true);

                        this.focus();
                    } else {
                        cbSampleGroup.setDisabled(false);

                        if ( cbSampleGroup.getValue() != '' ){
                            btnProcess.setDisabled(false);

                            tfAnalysisName.focus(); // working?
                        } else {
                            cbSampleGroup.focus(); // working?
                        }
                    }
                },
                cleared: function(){
                    cbSampleGroup.setDisabled(true);
                    btnProcess.setDisabled(true);

                    this.focus();
                },
                select: function(c, r, i){
                    var value = this.getValue();

                    if ( value != lastlySelectedXML ){
                        lastlySelectedXML = value;

                        maskGlobal.msg = 'Obtaining the available sample groups, please, wait...';
                        maskGlobal.show();

                        this.setDisabled(true); // to prevent interaction with that combo while the mask is on
                        tfAnalysisName.setDisabled(true); // to prevent interaction with that combo while the mask is on
                        tfAnalysisDescription.setDisabled(true); // to prevent interaction with that combo while the mask is on

                        // when we have an example with multiple xml workspaces, then probably need to clear out the cbSampleGroup ('s store)

                        wpSampleGroupsFetchingConfig.path = decodeURI( value ).slice(5);

                        wpSampleGroupsFetching.render();
                    } else {
                        cbSampleGroup.setDisabled(false);

                        if ( cbSampleGroup.getValue() != '' ){
                            btnProcess.setDisabled(false);

                            this.triggerBlur();

                            tfAnalysisName.focus();
                        } else {
                            this.triggerBlur();

                            cbSampleGroup.focus();
                        }
                    }
                }
            },
            minChars: 0,
            mode: 'local',
            store: strXML,
            tpl: '<tpl for="."><div class="x-combo-list-item">{FileName:htmlEncode}</div></tpl>',
            triggerAction: 'all',
            typeAhead: true,
            valueField: 'FilePath',
            width: 200
        });

        var cbSampleGroup = new Ext.form.ClearableComboBox({
            allowBlank: true,
            disabled: true,
            displayField: 'SampleGroup',
            emptyText: 'Select...',
            forceSelection: true,
            listeners: {
                change: function(){
                    if ( this.getValue() != '' ){
                        btnProcess.setDisabled(false);

                        tfAnalysisName.focus(); // working?
                    } else {
                        btnProcess.setDisabled(true);

                        this.focus();
                    }
                },
                cleared: function(){
                    btnProcess.setDisabled(true);

                    this.focus();
                },
                select: function(){
                   btnProcess.setDisabled(false);

                   this.triggerBlur();

                   tfAnalysisName.focus();
                }
            },
            minChars: 0,
            mode: 'local',
            store: strSampleGroup,
            tpl: '<tpl for="."><div class="x-combo-list-item">{SampleGroup:htmlEncode}</div></tpl>',
            triggerAction: 'all',
            typeAhead: true,
            valueField: 'SampleGroup',
            width: 200
        });

        strSampleGroup.on({
                'load': function(){
                    cbSampleGroup.focus();
                    cbSampleGroup.expand();
                }
        });

        var tfAnalysisName = new Ext.form.TextField({
            allowBlank: true,
            emptyText: 'Type...',
            width: 200
        });

        var tfAnalysisDescription = new Ext.form.TextField({
            allowBlank: true,
            emptyText: 'Type...',
            width: 200
        });


        /////////////////////////////////////
        //             Buttons             //
        /////////////////////////////////////
        var btnProcess = new Ext.Button({
            disabled: true,
            handler: function(){
                if ( tfAnalysisName.getValue() == '' ){
                    updateInfoStatus( 'Empty analysis name is not allowed', -1 );

                    tfAnalysisName.focus();
                    tfAnalysisName.getEl().frame( "ff0000", 1, { duration: 3 } );
                } else if ( tfAnalysisDescription.getValue() == '' ){
                    updateInfoStatus( 'Empty analysis description is not allowed', -1 );

                    tfAnalysisDescription.focus();
                    tfAnalysisDescription.getEl().frame( "ff0000", 1, { duration: 3 } );
                } else{
                    if ( cbSampleGroup.getValue() != '' ){
                        this.setDisabled(true);
                        cbXml.setDisabled(true);
                        cbSampleGroup.setDisabled(true);
                        tfAnalysisName.setDisabled(true);
                        tfAnalysisDescription.setDisabled(true);

                        maskGlobal.msg = 'Generating and saving the analysis data, please, wait...';
                        maskGlobal.show();

                        wpParseConfig.xmlPath               = wpSampleGroupsFetchingConfig.path;
                        wpParseConfig.sampleGroupName       = cbSampleGroup.getValue();
                        wpParseConfig.analysisName          = tfAnalysisName.getValue();
                        wpParseConfig.analysisDescription   = tfAnalysisDescription.getValue();
                        wpParseConfig.studyVars             = cbStudyVarName.getValue();
                        wpParseConfig.rootPath              = Ext.util.Format.undef(rootPath);

                        wpParse.render();
                    }
                }
            },
            text: 'Process'
        });

        var btnBack = new Ext.Button({
            disabled: true,
            text: '< Back'
        });

        var btnNext = new Ext.Button({
            text: 'Next >'
        });

        /////////////////////////////////////
        //             Web parts           //
        /////////////////////////////////////
        var wpSampleGroupsFetchingConfig = {
            reportId:'module:OpenCytoPreprocessing/SampleGroups.r',
//                    showSection: 'textOutput', // comment out to show debug output
            title:'HiddenDiv'
        };

        var wpSampleGroupsFetching = new LABKEY.WebPart({
            frame: 'none',
            partConfig: wpSampleGroupsFetchingConfig,
            partName: 'Report',
            renderTo: 'wpSampleGroupsFetching' + config.webPartDivId,
            success: function(){
                maskGlobal.hide();

                cbXml.setDisabled(false);
                tfAnalysisName.setDisabled(false);
                tfAnalysisDescription.setDisabled(false);

                var inputArray = $('#wpSampleGroupsFetching' + config.webPartDivId + ' pre')[0].innerHTML;
                if ( inputArray.search('java.lang.RuntimeException: Failed starting process') < 0 ){
                    if ( inputArray.search('javax.script.ScriptException') < 0 ){
                        cbSampleGroup.setDisabled(false);
                        inputArray = inputArray.replace(/\n/g, '').replace('All Samples;', '').split(';');
                        var len = inputArray.length;
                        for ( var i = 0; i < len; i ++ ){
                            inputArray[i] = [ inputArray[i] ];
                        }
                        strSampleGroup.loadData(inputArray);
                    } else {
                        onFailure({
                            exception: inputArray.replace(/Execution halted\n/, 'Execution halted') + '.'
                        });
                    }
                } else {
                    onFailure({
                        exception: 'there was an error with starting R, make sure your administrator configured it properly.'
                    });
                }
            }
        });


        var wpParseConfig = {
            reportId: 'module:OpenCytoPreprocessing/OpenCytoPreprocessing.r',
            // showSection: 'textOutput',
            title: 'ParseDiv'
        };

        var wpParse = new LABKEY.WebPart({
            frame: 'none',
            partConfig: wpParseConfig,
            partName: 'Report',
            renderTo: 'wpParse' + config.webPartDivId,
            success: function(){
                maskGlobal.hide();

                cbXml.setDisabled(false);
                cbSampleGroup.setDisabled(false);
                tfAnalysisName.setDisabled(false);
                tfAnalysisDescription.setDisabled(false);

                btnProcess.setDisabled(false);

//                var activeIndex = this.items.indexOf( this.getLayout().activeItem ) + direction;
                pnlMain.getLayout().setActiveItem( 1 );
            }
        });


        /////////////////////////////////////
        //  Panels, Containers, Components //
        /////////////////////////////////////
        var cmpStudyVars = new Ext.Component({
            cls: 'bold-text',
            html: 'Select the study variables that are of interest for this project:'
        });

        var cmpStatus = new Ext.Component({
            html: 'Set the study variables and click \'Next\'',
            style: { paddingLeft: '10px' }
        });

        var pnlStudyVars = new Ext.Panel({
            defaults: {
                style: 'padding-bottom: 4px; padding-right: 4px; padding-left: 4px;'
            },
            items: [
                cmpStudyVars,
                new Ext.Panel({
                    border: false,
                    items: [ cbStudyVarName ],
                    layout: 'fit'
                })
            ],
            title: 'Configuration'
        });


        new Ext.Container({
            defaults: {
                style: 'padding-bottom: 1px;'
            },
            height: 39,
            items: [
                {
                    border: false,
                    html: 'Select the workspace:'
                },
                cbXml
            ],
            layout: 'vbox',
            renderTo: 'cntXml' + config.webPartDivId,
            width: 200
        });

        new Ext.Container({
            defaults: {
                style: 'padding-bottom: 1px;'
            },
            height: 39,
            items: [
                {
                    border: false,
                    html: 'Select the sample group:'
                },
                cbSampleGroup
            ],
            layout: 'vbox',
            renderTo: 'cntSampleGroup' + config.webPartDivId,
            width: 200
        });

        new Ext.Container({
            defaults: {
                style: 'padding-bottom: 1px;'
            },
            height: 39,
            items: [
                {
                    border: false,
                    html: 'Enter analysis name:'
                },
                tfAnalysisName
            ],
            layout: 'vbox',
            renderTo: 'cntAnalysisName' + config.webPartDivId,
            width: 200
        });

        new Ext.Container({
            defaults: {
                style: 'padding-bottom: 1px;'
            },
            height: 39,
            items: [
                {
                    border: false,
                    html: 'Enter analysis description:'
                },
                tfAnalysisDescription
            ],
            layout: 'vbox',
            renderTo: 'cntAnalysisDescription' + config.webPartDivId,
            width: 200
        });
        

        var pnlList = new Ext.Panel({
            border: false,
            contentEl: 'ulList' + config.webPartDivId
        });

        var pnlWorkspaces = new Ext.Panel({
            defaults: {
                hideMode: 'visibility',
                style: 'padding-bottom: 4px; padding-right: 4px; padding-left: 4px;'
            },
//                    disabled: true,
            forceLayout: true,
            items: [
                pnlList,
                new Ext.Component({
                    contentEl: 'wpSampleGroupsFetching' + config.webPartDivId
                }),
                new Ext.Component({
                    contentEl: 'wpParse' + config.webPartDivId
                })
            ],
            title: 'Workspaces'
        });


        var smCheckBox = new Ext.grid.CheckboxSelectionModel({
            checkOnly: true,
            listeners: {
                rowdeselect:    updateTableStatus,
                rowselect:      updateTableStatus
            },
            sortable: true
        });

        var pnlTable = new Ext.grid.GridPanel({
            autoScroll: true,
//                    colModel: new Ext.ux.grid.LockingColumnModel([
//                        {
//                            dataIndex: 'FileName',
//                            header: 'File Name',
//                            resizable: true,
//                            sortable: true
//                        }
//                    ]),
            colModel: new Ext.grid.ColumnModel({
                columns: [
                    smCheckBox,
                    {
                        dataIndex: 'FileName',
                        dragable: false,
                        header: 'File Name',
                        hideable: false,
                        resizable: true,
                        sortable: true,
                        tooltip: 'double click the separator between two column headers to fit the column width to its contents'
                    }
                ]
            }),
            selModel: smCheckBox,
            height: 200,
            loadMask: { msg: 'Loading data...', msgCls: 'x-mask-loading-custom' },
            plugins: ['autosizecolumns'], // new Ext.ux.plugins.CheckBoxMemory({ idProperty: 'FileName' })],
            store: strFilteredTable,
            stripeRows: true,
            title:'Files',
//                    view: new Ext.ux.grid.LockingGridView(),
            viewConfig:
            {
                emptyText: 'No rows to display',
                splitHandleWidth: 10
            }
        });

        //captureEvents( pnlTable );

        var pnlComp = new Ext.Panel({
            defaults: {
                style: 'padding-bottom: 4px; padding-right: 4px; padding-left: 4px;'
            },
            hideMode: 'offsets',
            items: [],
            title: 'Compensation'
        });


        var pnlMain = new Ext.Panel({
            activeItem: 0,
            autoHeight: true,
            bodyStyle: {
                paddingTop: '3px'
            },
            border: false,
            defaults: {
                autoHeight: true,
                hideMode: 'offsets'
            },
            deferredRender: false,
            forceLayout: true,
            items: [
                pnlStudyVars,
                pnlWorkspaces,
                new Ext.Container({
                    //border: false,
                    items: [ pnlTable ],
                    layout: 'fit'
                }),
                pnlComp
            ],
            layout: 'card',
            listeners: {
                afterrender: function(){
                    maskGlobal = new Ext.LoadMask( this.getEl(), {msgCls: 'x-mask-loading-custom'} );
                }
            },
            tbar: new Ext.Toolbar({
//                autoHeight: true,
                items: [ btnProcess, btnBack, btnNext, cmpStatus ]
            })/*,
            width: '100%'*/
        });

        btnBack.on( 'click', navHandler.createDelegate( pnlMain, [-1] ) );
        btnNext.on( 'click', navHandler.createDelegate( pnlMain, [1] ) );


        /////////////////////////////////////
        //             Functions           //
        /////////////////////////////////////
        function updateInfoStatus( text, code ){
            cmpStatus.update( text );
            if ( text != '' ){
                if ( code == -1 ){
                    cmpStatus.getEl().setStyle( {color: 'red'} );
                    cmpStatus.getEl().frame( "ff0000", 1, { duration: 3 } ); // RED ERROR
                } else if ( code == 1 ) {
                    cmpStatus.getEl().setStyle( {color: 'black'} );
                }
                else {
                    cmpStatus.getEl().setStyle( {color: 'black'} );
                    cmpStatus.getEl().frame();
                }
            }
        };

        function updateTableStatus(){
            var count = pnlTable.getSelectionModel().getCount();
            if ( count == 1 ){
                pnlTable.setTitle( count + ' file is currently chosen' );
            } else {
                pnlTable.setTitle( count + ' files are currently chosen' );
            }

            var t = Ext.fly(pnlTable.getView().innerHd).child('.x-grid3-hd-checker');
            var isChecked = t.hasClass('x-grid3-hd-checker-on');
            var selectedCount = pnlTable.getSelectionModel().getCount();
            var totalCount = pnlTable.getStore().getCount();

            if ( selectedCount != totalCount & isChecked ){
                t.removeClass('x-grid3-hd-checker-on');
            } else if ( selectedCount == totalCount & ! isChecked ){
                t.addClass('x-grid3-hd-checker-on');
            }
        };

        function setStudyVars() {
            var i, len, c, curLabel, curValue, curFlag, tempSQL, newColumns;

            // Grab the choices array
            var arrayStudyVars = cbStudyVarName.getValueEx();

            newColumns =
                [
                    smCheckBox,
                    {
                        dataIndex: 'FileName',
                        header: 'File Name'
                    }
                ];
            tempSQL = strngSqlStartTable;
            currentComboId = undefined;
            strFilteredTable.setUserFilters([]);

            len = arrayStudyVars.length;

            for ( i = 0; i < len; i ++ ){
                c = arrayStudyVars[i];
                curLabel = c.Display; curValue = c.Value; curFlag = curLabel.slice(-2,-1);

                if ( curFlag == 'l' ){ // External study variable
                    curLabel = curLabel.slice(0, -11);
                    tempSQL += ', FCSFiles.Sample."' + curLabel + '" AS "' + curValue + '"';
                    curLabel += ' (External)';
                } else if ( curFlag == 'd' ){ // Keyword study variable
                    curLabel = curLabel.slice(0, -10);
                    tempSQL += ', FCSFiles.Keyword."' + curLabel + '" AS "' + curValue + '"';
                    curLabel += ' (Keyword)';
                } else {
                    i = len;
                    onFailure({
                        exception: 'there was an error while executing this command: data format mismatch.'
                    });
                }

                newColumns.push({
                    dataIndex: curValue,
                    header: curLabel
                });

            } // end of for ( i = 0; i < len; i ++ ) loop

            tempSQL += strngSqlEndTable;

            strFilteredTable.setSql( tempSQL );
            strFilteredTable.load();

            pnlTable.reconfigure(
                pnlTable.getStore(),
                new Ext.grid.ColumnModel({
                    columns: newColumns,
                    defaults: {
                        dragable: false,
                        hideable: false,
                        resizable: true,
                        sortable: true,
                        tooltip: 'double click the separator between two column headers to fit the column width to its contents'
                    }
                })
            );

            if ( cbSampleGroup.getValue() != '' & cbXml.getValue() != '' ){
                btnProcess.setDisabled(false);
            }
        }; // end of setStudyVars()

        function navHandler(direction){
            var activeIndex = this.items.indexOf( this.getLayout().activeItem ) + direction;
            this.getLayout().setActiveItem( activeIndex );
            if ( activeIndex == 0 ){
                btnBack.setDisabled(true);

                btnProcess.setDisabled(true);
            }

            if ( activeIndex == 1 ){
                btnBack.setDisabled(false);

                setStudyVars();
            }

            if ( activeIndex == 2 ){ btnNext.setDisabled(false); }

            if ( activeIndex == 3 ){ btnNext.setDisabled(true); }

            updateInfoStatus( '' );
        };


        // jQuery-related


        this.border = false;
        this.boxMinWidth = 370; // ?
        this.frame = false;
        this.items = [ pnlMain ];
        this.layout = 'fit';
        this.renderTo = config.webPartDivId;
        this.webPartDivId = config.webPartDivId;

        LABKEY.ext.OpenCytoPreprocessing.superclass.constructor.apply(this, arguments);

    }, // end constructor

    resize: function(){
//                webPartContentWidth = document.getElementById(this.webPartDivId).offsetWidth;

//                 if ( typeof resizableImage != 'undefined' ){
//                 if ( $('#resultImage').width() > 2/3*pnlStudyVars.getWidth() ){
//                 resizableImage.resizeTo( 2/3*pnlStudyVars.getWidth(), 2/3*pnlStudyVars.getWidth() );
//                 }
//                 }
    }
}); // end OpenCytoPreprocessing Panel class
