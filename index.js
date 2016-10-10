import route from 'boulevard';
import url from 'url';
import rawBody from 'raw-body';
import qs from 'qs';
import {send} from 'micro';
import cookie from 'cookie';
import merge from 'lodash.merge';

const formBody = req => rawBody(req, {encoding: 'utf8'}).then(qs.parse);
const redirect = (res, location, status = 302) => {
	res.setHeader('location', location);
	return send(res, status, `Redirected to ${location}`);
};

const blogs = {};

const html = (res, t, status = 200) => {
	res.setHeader('content-type', 'text/html;charset=utf-8');
	send(res, status, t);
};

const cookies = req => cookie.parse(req.headers.cookie || '');
const setCookies = (res, cookies) => Object.keys(cookies).forEach(
	key => res.setHeader('set-cookie', cookie.serialize(key, cookies[key]))
);

const val = (value, received) => `value="${value}" ${received === value ? 'selected' : ''}`;

const blogForm = (
	id = '',
	{authornamestyle = '', contentorder = ''} = {},
	{title = '', excerpt = '', status = ''} = {}
) => `<form action="/blog/${id}" method="POST">
	<input value="${title}" name="title" placeholder="Title">
	<input value="${excerpt}" name="excerpt" placeholder="Excerpt">
	<select name="nameStyle">
		<option ${val('', authornamestyle)}>Author name style</option>
		<option ${val('full', authornamestyle)}>Full name</option>
		<option ${val('initials', authornamestyle)}>Initials</option>
	</select>
	<select name="contentOrder">
		<option ${val('', contentorder)}>Content order</option>
		<option ${val('descending', contentorder)}>New messages at top</option>
		<option ${val('ascending', contentorder)}>New messages at bottom</option>
	</select>
	<select name="status">
		<option ${val('', status)}>Blog status</option>
		<option ${val('pending', status)}>Pending</option>
		<option ${val('inprogress', status)}>In progress</option>
		<option ${val('closed', status)}>Archived</option>
	</select>
	<input type="submit" value="${id ? 'Update blog' : 'Create blog'}">
</form>`;

const blogFormMeta = (blog, body) => {
	if(!blog.meta || (body.title !== blog.meta.title || body.excerpt !== blog.meta.excerpt)) {
		blog.catchup.push({
			event: 'postSaved',
			data: body
		});
	}

	merge(blog, {
		config: {
			authornamestyle: body.nameStyle || 'full',
			contentorder: body.contentOrder || 'descending',
		},
		meta: {
			title: body.title,
			excerpt: body.excerpt,
			status: body.status || 'pending',
		}
	});
}

const renderMessage = id => ({event, data}) => `<li id="${event}-${typeof data.mid === 'undefined' ? data.messageid : data.mid}">
${event === 'msg' || event === 'editmsg' ? `
	<b>${data.authornamestyle === 'full' ? data.authordisplayname : data.author}</b>
	<time datetime="${new Date(data.emb * 1000).toISOString()}">${new Date(data.emb * 1000).toLocaleString()}</time>
	${event === 'editmsg' ? `<i>edited message <a href="#msg-${data.mid}">${data.mid}</a></i>` : ''}
	<p>
		${data.textrendered}
	</p>

	${event === 'msg' ? `<form action="/blog/${id}/post/${data.mid}?action=edit" method="POST">
		<input value="${data.textrendered}" name="msg">
		<button name="action" value="edit" type="submit">✎</button>
		<button name="action" value="delete" type="submit">🚫</button>
	</form>` : ''}
` : event === 'delete' ? `<i>deleted message <a href="#msg-${data.messageid}">${data.messageid}</a></i>`
: event === 'postSaved' ? `<i>updated title to "${data.title}" and excerpt to "${data.excerpt}"</i>`
: `what's a "${event}"`}</li>`;

export default route({
	'/' (req, res) {
		const {authorName = ''} = cookies(req);

		return html(res, `
		<h1>Live blogs testing tool</h1>

		${Object.keys(blogs).length ? '<h2>Blogs</h2>' : ''}
		<ul>
			${Object.keys(blogs).map(key => `<li><a href="/blog/${key}">${blogs[key].meta.title}</a></li>`).join('\n')}
		</ul>
		<h2>Create blog</h2>
		${blogForm()}
		<h2>Author name</h2>
		<form action="/author" method="GET">
			<input name="name" placeholder="Author name" value="${authorName}">
			<input type="submit" value="Change author name">
		</form>`);
	},

	'/author' (req, res) {
		const {query = {}} = url.parse(req.url, true);

		setCookies(res, {
			authorName: query.name
		});

		return redirect(res, '/');
	},

	async '/blog' (req, res) {
		switch(req.method) {
			case 'POST': {
				const id = Math.floor(Math.random() * 0xffffffffff).toString(36);
				blogs[id] = {
					catchup: [],
				};

				blogFormMeta(blogs[id], await formBody(req));

				return redirect(res, `/blog/${id}`);
			}
		}
	},

	async '/blog/:id' (req, res, params) {
		const blog = blogs[params.id];
		if(!blog) return html(res, `<a href="/">↩</a> blog ${params.id} not found`, 404);

		switch(req.method) {
			case 'POST': {
				blogFormMeta(blogs[params.id], await formBody(req));
				return redirect(res, `/blog/${params.id}`);
			}

			default: {
				const {query = {}} = url.parse(req.url, true);

				switch(query.action) {
					case 'catchup': {
						return blog.catchup;
					}

					case 'getconfig': {
						return blog.config;
					}

					case 'getmeta': {
						return blog.meta;
					}

					default: {
						return html(res, `
							<h1><a href="/">↩</a> Live blogs testing tool</h1>

							<article>
							<h2>${blog.meta.title}</h2>
							<h3>${blog.meta.excerpt}</h3>

							<hr>
							<h4>Edit blog</h4>
							${blogForm(params.id, blog.config, blog.meta)}

							<hr>
							<h4>Write message</h4>
							<form action="/blog/${params.id}/post" method="POST">
								<input name="msg" placeholder="Message"><input type="submit" value="+">
							</form>

							${blog.catchup.length ? '<hr><h4>Messages &amp; events</h4>' : ''}
							<ul>
								${blog.catchup.map(renderMessage(params.id)).join('\n')}
							</ul>
						</article>
						<style> :target { background: #fed; } li { margin: 1em 0; } </style>`);
					}
				}
			}
		}
	},

	async '/blog/:id/post' (req, res, params) {
		const blog = blogs[params.id];
		if(!blog) return html(res, `<a href="/">↩</a> blog ${params.id} not found`, 404);

		const {authorName = 'Unknown'} = cookies(req);
		const body = await formBody(req);
		blog.catchup.push({
			event: 'msg',
			data: {
				mid: blog.catchup.length,
				textrendered: body.msg,
				emb: Math.floor(Date.now() / 1000),
				datemodified: Math.floor(Date.now() / 1000),
				authordisplayname: authorName,
				author: authorName.split(' ').map(p => p[0].toUpperCase()).join(''),
				authornamestyle: blog.config.authornamestyle,
			},
		});

		return redirect(res, `/blog/${params.id}`);
	},

	async '/blog/:id/post/:mid' (req, res, params) {
		const blog = blogs[params.id];
		if(!blog) return html(res, `<a href="/">↩</a> blog ${params.id} not found`, 404);

		const body = await formBody(req);
		switch(body.action) {
			case 'edit': {
				const msg = blog.catchup[parseInt(params.mid, 10)];

				blog.catchup.push({
					event: 'editmsg',
					data: Object.assign({}, msg.data, {
						textrendered: body.msg,
						datemodified: Math.floor(Date.now() / 1000),
					}),
				});

				return redirect(res, `/blog/${params.id}`);
			}

			case 'delete': {
				blog.catchup.push({
					event: 'delete',
					data: {
						messageid: params.mid
					}
				});

				return redirect(res, `/blog/${params.id}`);
			}
		}
	}
});
